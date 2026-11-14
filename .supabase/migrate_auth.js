const { Client } = require('pg');

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD environment variable is required.');
}

const client = new Client({
  user: process.env.SUPABASE_DB_USER || 'postgres.mdcvljbbnoxqsfwcjvqz',
  host: process.env.SUPABASE_DB_HOST || 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: dbPassword,
  port: 6543,
  ssl: { ca: require('fs').readFileSync(require('path').join(__dirname, 'prod-ca-2021.crt'), 'utf8') } // verify Supabase's certificate
});

const tables = [
  'uyeler',
  'programlar',
  'olcumler',
  'antrenmanlar',
  'dokumanlar',
  'master_egzersizler',
  'master_besinler',
  'beslenme_planlari',
  'weekly_program_schedule',
  'push_subscriptions',
  'push_reminder_deliveries',
  'schedule_notifications',
  'schedule_attendance',
  'workout_completions',
  'trainers',
  'schema_migrations',
  'device_connections',
  'health_metrics',
  'workout_sessions'
  ,'workout_session_steps'
];

// Every policy this script creates is recorded here by createPolicies(), so the unknown-policy guard cannot drift.
const knownPolicies = new Set();
function createPolicies(sql) {
  // Policy names must be double-quoted to be recorded; an unquoted name would be rejected by the guard.
  for (const match of sql.matchAll(/CREATE POLICY "([^"]+)"/g)) knownPolicies.add(match[1]);
  return client.query(sql);
}

async function migrate() {
  let began = false; // ROLLBACK on a never-connected client would hang forever
  try {
    await client.connect();
    await client.query('BEGIN');
    began = true;
    const startedAt = Date.now();
    await client.query(`SET LOCAL lock_timeout = '15s'`);
    for (const table of tables) {
      const stmts = []; // one round trip per table keeps the transaction short
      stmts.push(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      stmts.push(`DROP POLICY IF EXISTS "${table}_authenticated_access" ON ${table};`);
      stmts.push(`DROP POLICY IF EXISTS "${table}_admin_access" ON ${table};`);
      stmts.push(`DROP POLICY IF EXISTS "${table}_member_read" ON ${table};`);
      if (table === 'uyeler') {
        stmts.push(`DROP POLICY IF EXISTS "uyeler_member_update" ON uyeler;`);
      }
      if (table === 'dokumanlar') {
        stmts.push(`DROP POLICY IF EXISTS "dokumanlar_member_consent_insert" ON dokumanlar;`);
      }
      if (table === 'olcumler') {
        stmts.push(`DROP POLICY IF EXISTS "olcumler_member_insert" ON olcumler;`);
      }
      if (table === 'push_subscriptions') {
        stmts.push(`DROP POLICY IF EXISTS "push_subscriptions_member_access" ON push_subscriptions;`);
      }
      if (table === 'push_reminder_deliveries') {
        stmts.push(`DROP POLICY IF EXISTS "push_reminder_deliveries_member_read" ON push_reminder_deliveries;`);
      }
      if (table === 'schedule_notifications') {
        stmts.push(`DROP POLICY IF EXISTS "schedule_notifications_member_read" ON schedule_notifications;`);
      }
      if (table === 'schedule_attendance') {
        stmts.push(`DROP POLICY IF EXISTS "schedule_attendance_member_access" ON schedule_attendance;`);
      }
      if (table === 'workout_completions') {
        stmts.push(`DROP POLICY IF EXISTS "workout_completions_member_access" ON workout_completions;`);
      }
      if (['device_connections', 'health_metrics', 'workout_sessions', 'workout_session_steps'].includes(table)) {
        stmts.push(`DROP POLICY IF EXISTS "${table}_member_access" ON ${table};`);
      }
      stmts.push(`
        CREATE POLICY "${table}_admin_access"
        ON ${table}
        FOR ALL
        TO authenticated
        USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
      `);
      await createPolicies(stmts.join('\n'));
    }
    await createPolicies(`
      CREATE OR REPLACE FUNCTION public.assign_default_member_role()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = auth, public
      AS $$
      BEGIN
        IF COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'role' IS NULL THEN
          NEW.raw_app_meta_data := jsonb_set(
            COALESCE(NEW.raw_app_meta_data, '{}'::jsonb),
            '{role}',
            '"user"'::jsonb,
            true
          );
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS assign_default_member_role ON auth.users;
      CREATE TRIGGER assign_default_member_role
      BEFORE INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_default_member_role();

      CREATE OR REPLACE FUNCTION public.create_member_profile_for_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = auth, public
      AS $$
      BEGIN
        INSERT INTO public.uyeler (id, ad_soyad, email, auth_user_id, brans, cinsiyet, kayit_tarihi)
        VALUES (
          floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
          COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
          NEW.email,
          NEW.id,
          'Fitness',
          'Belirtilmedi',
          CURRENT_DATE
        )
        ON CONFLICT (auth_user_id) DO NOTHING;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS create_member_profile_for_user ON auth.users;
      CREATE TRIGGER create_member_profile_for_user
      AFTER INSERT ON auth.users
      FOR EACH ROW
      WHEN (COALESCE(NEW.raw_app_meta_data ->> 'role', 'user') = 'user')
      EXECUTE FUNCTION public.create_member_profile_for_user();

      CREATE POLICY "uyeler_member_read"
      ON uyeler
      FOR SELECT
      TO authenticated
      USING (auth.uid() = auth_user_id);

      CREATE POLICY "uyeler_member_update"
      ON uyeler
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = auth_user_id)
      WITH CHECK (auth.uid() = auth_user_id);

      CREATE POLICY "olcumler_member_insert"
      ON olcumler
      FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = olcumler.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "olcumler_member_read"
      ON olcumler
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = olcumler.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "antrenmanlar_member_read"
      ON antrenmanlar
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = antrenmanlar.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "dokumanlar_member_read"
      ON dokumanlar
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = dokumanlar.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      -- Clients may only ADD their own KVKK consent receipt (no update, no delete).
      CREATE POLICY "dokumanlar_member_consent_insert"
      ON dokumanlar
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tip = 'KVKK'
        AND starts_with(yol, member_id::text || '/kvkk_riza_')
        AND EXISTS (
          SELECT 1 FROM uyeler
          WHERE uyeler.id = dokumanlar.member_id
            AND uyeler.auth_user_id = auth.uid()
        )
      );

      CREATE POLICY "beslenme_planlari_member_read"
      ON beslenme_planlari
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = beslenme_planlari.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "weekly_program_schedule_member_read"
      ON weekly_program_schedule
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = weekly_program_schedule.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "push_subscriptions_member_access"
      ON push_subscriptions
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = push_subscriptions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = push_subscriptions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "push_reminder_deliveries_member_read"
      ON push_reminder_deliveries
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM push_subscriptions
        JOIN uyeler ON uyeler.id = push_subscriptions.member_id
        WHERE push_subscriptions.id = push_reminder_deliveries.subscription_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "schedule_notifications_member_read"
      ON schedule_notifications
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = schedule_notifications.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "schedule_attendance_member_access"
      ON schedule_attendance
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = schedule_attendance.member_id
          AND uyeler.auth_user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = schedule_attendance.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "workout_completions_member_access"
      ON workout_completions
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = workout_completions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = workout_completions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      -- Clients may only READ their own device_connections; data arrives through the Edge Function (trainer/service role).
      CREATE POLICY "device_connections_member_read"
      ON device_connections
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = device_connections.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      -- Clients may only READ their own health_metrics; data arrives through the Edge Function (trainer/service role).
      CREATE POLICY "health_metrics_member_read"
      ON health_metrics
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = health_metrics.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "workout_sessions_member_access"
      ON workout_sessions
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = workout_sessions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM uyeler
        WHERE uyeler.id = workout_sessions.member_id
          AND uyeler.auth_user_id = auth.uid()
      ));

      CREATE POLICY "workout_session_steps_member_access"
      ON workout_session_steps
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM workout_sessions
        JOIN uyeler ON uyeler.id = workout_sessions.member_id
        WHERE workout_sessions.id = workout_session_steps.workout_session_id
          AND uyeler.auth_user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM workout_sessions
        JOIN uyeler ON uyeler.id = workout_sessions.member_id
        WHERE workout_sessions.id = workout_session_steps.workout_session_id
          AND uyeler.auth_user_id = auth.uid()
      ));
    `);

    // Document files (private bucket "dokumanlar", one folder per member id):
    // trainers manage all files, members may only read files in their own folder.
    await createPolicies(`
      DROP POLICY IF EXISTS "dokumanlar_storage_admin_access" ON storage.objects;
      CREATE POLICY "dokumanlar_storage_admin_access"
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (bucket_id = 'dokumanlar' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
      WITH CHECK (bucket_id = 'dokumanlar' AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

      DROP POLICY IF EXISTS "dokumanlar_storage_member_read" ON storage.objects;
      CREATE POLICY "dokumanlar_storage_member_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'dokumanlar' AND EXISTS (
        SELECT 1 FROM public.uyeler u
        WHERE u.auth_user_id = auth.uid()
          AND u.id::text = (storage.foldername(name))[1]
      ));
    `);

    // Consent receipts: a client may upload ONLY a kvkk_riza_* file directly inside their own folder.
    await createPolicies(`
      DROP POLICY IF EXISTS "dokumanlar_storage_member_consent_insert" ON storage.objects;
      CREATE POLICY "dokumanlar_storage_member_consent_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'dokumanlar'
        AND array_length(storage.foldername(name), 1) = 1
        AND starts_with(storage.filename(name), 'kvkk_riza_')
        AND EXISTS (
          SELECT 1 FROM public.uyeler u
          WHERE u.auth_user_id = auth.uid()
            AND u.id::text = (storage.foldername(name))[1]
        )
      );
    `);

    // Live sync: the trainer view listens for changes on these tables (REALTIME_TABLES in script.js).
    // Realtime still applies RLS, so users only receive rows they may read. Additive and re-runnable.
    await client.query(`
      DO $$
      DECLARE t text;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
        FOREACH t IN ARRAY ARRAY['uyeler','programlar','olcumler','antrenmanlar','dokumanlar',
                                 'weekly_program_schedule','master_egzersizler','master_besinler',
                                 'beslenme_planlari','device_connections','health_metrics','workout_sessions',
                                 'workout_session_steps'] LOOP
          IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
             AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
          END IF;
        END LOOP;
      END $$;
    `);

    // Clients may update their own profile (uyeler_member_update), but only the questionnaire
    // columns. Allow-list: new columns stay trainer-only until added here on purpose.
    // Trainers (admin), migrations and Edge Functions are not limited.
    await client.query(`
      CREATE OR REPLACE FUNCTION public.uyeler_limit_member_updates()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      DECLARE
        member_editable text[] := ARRAY['ad_soyad','telefon','dogum_tarihi','cinsiyet','boy',
          'saglik_gecmisi','alerjiler','beslenme_aliskanliklari','hareket_aliskanliklari',
          'spor_gecmisi','beklentiler','degerlendirme_verileri','degerlendirme_tamamlandi',
          'degerlendirme_tarihi'];
      BEGIN
        IF current_user = 'authenticated'
           AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
           AND (to_jsonb(NEW) - member_editable) IS DISTINCT FROM (to_jsonb(OLD) - member_editable) THEN
          RAISE EXCEPTION 'Clients may only update their questionnaire fields' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE OR REPLACE TRIGGER uyeler_limit_member_updates
      BEFORE UPDATE ON public.uyeler
      FOR EACH ROW EXECUTE FUNCTION public.uyeler_limit_member_updates();
    `);

    // Diet plans belong to a client but had no link, so deleting a client left them behind.
    // NOT VALID: applies to new deletions without checking (or failing on) existing rows.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beslenme_planlari_member_id_fkey') THEN
          ALTER TABLE public.beslenme_planlari
            ADD CONSTRAINT beslenme_planlari_member_id_fkey
            FOREIGN KEY (member_id) REFERENCES public.uyeler(id) ON DELETE CASCADE NOT VALID;
        END IF;
      END $$;
    `);

    const requiredPolicies = ['device_connections_member_read', 'health_metrics_member_read', 'workout_sessions_member_access', 'workout_session_steps_member_access'];
    const policyResult = await client.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY($1::text[])`,
      [requiredPolicies]
    );
    const foundPolicies = new Set(policyResult.rows.map(row => row.policyname));
    const missingPolicies = requiredPolicies.filter(policy => !foundPolicies.has(policy));
    if (missingPolicies.length > 0) {
      throw new Error(`Missing required RLS policies: ${missingPolicies.join(', ')}`);
    }

    // Guard: policies created outside this script (e.g. in the dashboard) are never dropped above.
    // On 2026-11-08 such policies exposed all client data to anyone holding the public key.
    // Fail the deploy if any policy lets anonymous users in, or grants unconditional access.
    const openPolicies = await client.query(`
      SELECT schemaname, tablename, policyname, roles::text AS roles, cmd
      FROM pg_policies
      WHERE schemaname IN ('public', 'storage')
        AND (roles && ARRAY['anon', 'public']::name[] OR qual = 'true' OR with_check = 'true')
      ORDER BY schemaname, tablename, policyname
    `);
    if (openPolicies.rows.length > 0) {
      const list = openPolicies.rows
        .map(row => `${row.schemaname}.${row.tablename} "${row.policyname}" ${row.roles} ${row.cmd}`)
        .join('\n  ');
      throw new Error(`Unsafe RLS policies found (anonymous or unconditional access):\n  ${list}`);
    }
    // Guard: any policy this script did not create is refused (it would otherwise stay live unreviewed).
    const allPolicies = await client.query(`
      SELECT schemaname, tablename, policyname, roles::text AS roles, cmd
      FROM pg_policies
      WHERE schemaname IN ('public', 'storage')
      ORDER BY schemaname, tablename, policyname
    `);
    const unknownPolicies = allPolicies.rows.filter(row => !knownPolicies.has(row.policyname));
    if (unknownPolicies.length > 0) {
      const list = unknownPolicies
        .map(row => `${row.schemaname}.${row.tablename} "${row.policyname}" ${row.roles} ${row.cmd}`)
        .join('\n  ');
      throw new Error(`Unknown RLS policies found (not created by this script):\n  ${list}`);
    }
    const tablesWithoutRls = await client.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      ORDER BY c.relname
    `);
    if (tablesWithoutRls.rows.length > 0) {
      throw new Error(`Tables without RLS: ${tablesWithoutRls.rows.map(row => row.relname).join(', ')}`);
    }

    await client.query(`NOTIFY pgrst, 'reload schema';`);
    await client.query('COMMIT');
    console.log('Admin-only RLS policies enabled.');
    console.log(`Migration committed in ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`);
  } catch (error) {
    if (began) await client.query('ROLLBACK').catch(e => console.error('ROLLBACK failed:', e.message));
    console.error('Auth migration failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
