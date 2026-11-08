const { Client } = require('pg');

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD environment variable is required.');
}

const client = new Client({
  user: 'postgres.mdcvljbbnoxqsfwcjvqz',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: dbPassword,
  port: 6543,
  ssl: {
    rejectUnauthorized: false
  }
});

const extendedExerciseCatalog = require('./exercise_catalog_extended.json');
const karateShotokanCatalog = require('./karate_shotokan_catalog');

function deriveExerciseTaxonomy({ name, branch, bodyPart, muscles }) {
  const text = `${name} ${muscles.join(' ')}`.toLowerCase();
  const classification = [];
  if (bodyPart === 'Alt Ekstremite') classification.push('Alt Ekstremite');
  else if (bodyPart === 'Üst Ekstremite') classification.push('Üst Ekstremite');
  else if (/squat|lunge|jump|kick|glute|quad|hamstring|calf|hip|leg|dachi|geri|barai/.test(text)) classification.push('Alt Ekstremite');
  if (bodyPart === 'Üst Ekstremite' || /push|pull|press|row|punch|strike|shoulder|chest|back|arm|uchi|zuki|uke/.test(text)) {
    classification.push('Üst Ekstremite');
  }
  if (classification.length === 0) classification.push('Bölgesel');
  if (/chest|quad|shoulder|press|push|front|zuki|uke|kick|core|abdomen|psoas/.test(text)) {
    classification.push('Anterior Chain');
  }
  if (/back|lat|hamstring|glute|calf|posterior|row|pull|deadlift|hinge|spine|dachi/.test(text)) {
    classification.push('Posterior Chain');
  }
  if (
    ['Fitness', 'Fonksiyonel', 'Calisthenics', 'Plyometrics', 'Karate', 'Kickboks'].includes(branch) ||
    /squat|lunge|deadlift|press|row|carry|crawl|jump|swing|snatch|clean|combination|flow|dachi|kumite/.test(text)
  ) {
    classification.push('Compound');
  } else {
    classification.push('Bölgesel');
  }
  if (['Mobility', 'Corrective', 'Yoga'].includes(branch) || /stretch|mobility|release|rotation|switch|flow|balance/.test(text)) {
    classification.push('Fasyal');
  }
  const result = { classification: [...new Set(classification)] };
  if (branch === 'Yoga') result.styles = ['Hatha'];
  if (branch === 'Karate') {
    result.drill = /kumite|timing|angle|shuffle/.test(text) ? 'Kumite' : /heian|tekki|bunkai/.test(text) ? 'Kata' : 'Kihon';
  }
  return result;
}

const exerciseCatalog = [
  ['Air Squat', 'Fonksiyonel', 'Alt Ekstremite', ['Quad', 'Glute'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Reverse Lunge', 'Fonksiyonel', 'Alt Ekstremite', ['Quad', 'Glute'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Bulgarian Split Squat', 'Fitness', 'Alt Ekstremite', ['Quad', 'Glute'], 'Adjustable bench', 'Orta'],
  ['Barbell Back Squat', 'Fitness', 'Alt Ekstremite', ['Quad', 'Glute'], 'Olympic bar, plates, power rack', 'Orta'],
  ['Front Rack Reverse Lunge', 'Fitness', 'Alt Ekstremite', ['Quad', 'Glute'], 'Olympic bar, plates, power rack', 'Orta'],
  ['Romanian Deadlift', 'Fitness', 'Alt Ekstremite', ['Hamstring', 'Glute'], 'Olympic bar, plates', 'Orta'],
  ['Single-Leg Romanian Deadlift', 'Fitness', 'Alt Ekstremite', ['Hamstring', 'Glute'], 'Dumbbells', 'Orta'],
  ['Kettlebell Swing', 'Fonksiyonel', 'Alt Ekstremite', ['Glute', 'Hamstring'], 'Kettlebells', 'Orta'],
  ['Goblet Squat', 'Fitness', 'Alt Ekstremite', ['Quad', 'Glute'], 'Kettlebells, dumbbells', 'Başlangıç'],
  ['Barbell Hip Thrust', 'Fitness', 'Alt Ekstremite', ['Glute'], 'Olympic bar, plates, adjustable bench', 'Orta'],
  ['Push-Up', 'Calisthenics', 'Üst Ekstremite', ['Göğüs', 'Triceps'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Pull-Up', 'Calisthenics', 'Üst Ekstremite', ['Sırt', 'Biceps'], 'Pullup bar', 'İleri'],
  ['Band-Assisted Pull-Up', 'Calisthenics', 'Üst Ekstremite', ['Sırt', 'Biceps'], 'Pullup bar, resistance bands', 'Başlangıç'],
  ['Dips', 'Calisthenics', 'Üst Ekstremite', ['Göğüs', 'Triceps'], 'Dips bar', 'Orta'],
  ['Pike Push-Up', 'Calisthenics', 'Üst Ekstremite', ['Omuz', 'Triceps'], 'Vücut ağırlığı', 'Orta'],
  ['Dumbbell Floor Press', 'Fitness', 'Üst Ekstremite', ['Göğüs', 'Triceps'], 'Dumbbells', 'Başlangıç'],
  ['Barbell Overhead Press', 'Fitness', 'Üst Ekstremite', ['Omuz', 'Triceps'], 'Olympic bar, plates, power rack', 'Orta'],
  ['One-Arm Dumbbell Row', 'Fitness', 'Üst Ekstremite', ['Sırt', 'Biceps'], 'Dumbbell, adjustable bench', 'Başlangıç'],
  ['Landmine Press', 'Fitness', 'Üst Ekstremite', ['Omuz', 'Göğüs'], 'Landmine, Olympic bar', 'Orta'],
  ['Band Face Pull', 'Corrective', 'Üst Ekstremite', ['Omuz', 'Sırt'], 'Resistance bands', 'Başlangıç'],
  ['Medicine Ball Slam', 'Plyometrics', 'Tüm Vücut', ['Omuz', 'Core'], 'Medicine balls', 'Başlangıç'],
  ['Box Jump', 'Plyometrics', 'Alt Ekstremite', ['Quad', 'Glute', 'Calf'], 'Jump box', 'Orta'],
  ['Lateral Bound', 'Plyometrics', 'Alt Ekstremite', ['Glute', 'Calf'], 'Vücut ağırlığı', 'Orta'],
  ['Jump Rope Basic Bounce', 'Plyometrics', 'Tüm Vücut', ['Calf'], 'Jump rope', 'Başlangıç'],
  ['Sled Push', 'Fonksiyonel', 'Tüm Vücut', ['Quad', 'Glute'], 'Sled', 'Orta'],
  ['Battle Rope Alternating Waves', 'Fonksiyonel', 'Tüm Vücut', ['Omuz', 'Core'], 'CrossFit conditioning rope', 'Başlangıç'],
  ['Dead Bug', 'Corrective', 'Tüm Vücut', ['Core'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Side Plank', 'Corrective', 'Tüm Vücut', ['Core'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Wall Slide', 'Corrective', 'Üst Ekstremite', ['Omuz', 'Sırt'], 'Swedish wall bars', 'Başlangıç'],
  ['90/90 Hip Switch', 'Mobility', 'Alt Ekstremite', ['Glute'], 'Vücut ağırlığı', 'Başlangıç'],
  ['World’s Greatest Stretch', 'Mobility', 'Tüm Vücut', ['Hamstring', 'Glute'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Cat-Cow Flow', 'Yoga', 'Tüm Vücut', ['Core'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Downward Dog', 'Yoga', 'Tüm Vücut', ['Hamstring', 'Calf'], 'Vücut ağırlığı', 'Başlangıç'],
  ['Karate Front Kick Drill', 'Karate', 'Tüm Vücut', ['Core', 'Quad'], 'Mitt and strike pads', 'Başlangıç'],
  ['Karate Roundhouse Kick Drill', 'Karate', 'Tüm Vücut', ['Glute', 'Core'], 'Mitt and strike pads', 'Orta'],
  ['Kickboxing Jab-Cross Drill', 'Kickboks', 'Üst Ekstremite', ['Omuz', 'Core'], 'Punching bag, mitts', 'Başlangıç'],
  ['Kickboxing Pad Combination', 'Kickboks', 'Tüm Vücut', ['Omuz', 'Core'], 'Mitts and strike pads', 'Orta'],
  ['Landmine Rotation', 'Fonksiyonel', 'Tüm Vücut', ['Core', 'Omuz'], 'Landmine, Olympic bar', 'Orta'],
  ['Band Pallof Press', 'Corrective', 'Tüm Vücut', ['Core'], 'Resistance bands', 'Başlangıç'],
  ['Step-Up', 'Fonksiyonel', 'Alt Ekstremite', ['Quad', 'Glute'], 'Step board', 'Başlangıç'],
  ['Bear Crawl', 'Calisthenics', 'Tüm Vücut', ['Omuz', 'Core'], 'Vücut ağırlığı', 'Orta']
];

function validateExtendedCatalog() {
  const counts = extendedExerciseCatalog.reduce((result, exercise) => {
    result[exercise.branch] = (result[exercise.branch] || 0) + 1;
    return result;
  }, {});
  const names = extendedExerciseCatalog.map(exercise => exercise.name);
  const expectedBranches = ['Fitness', 'Fonksiyonel', 'Calisthenics', 'Plyometrics', 'Mobility', 'Corrective', 'Karate', 'Kickboks', 'Yoga'];
  if (
    extendedExerciseCatalog.length !== 450 ||
    expectedBranches.some(branch => counts[branch] !== 50) ||
    new Set(names).size !== names.length ||
    extendedExerciseCatalog.some(exercise => !exercise.classification?.length)
  ) {
    throw new Error('Extended exercise catalog must contain 50 unique classified exercises per branch.');
  }
}

function validateKarateCatalog() {
  const names = karateShotokanCatalog.map(exercise => exercise.name);
  if (new Set(names).size !== names.length || karateShotokanCatalog.some(exercise => !exercise.rank || !exercise.drill)) {
    throw new Error('Shotokan catalog entries must have unique names, rank, and drill metadata.');
  }
}

async function migrate() {
  try {
    validateExtendedCatalog();
    validateKarateCatalog();
    await client.connect();
    console.log('Connected to Supabase successfully.');

    await client.query(`
      ALTER TABLE master_egzersizler
        ADD COLUMN IF NOT EXISTS gruplar JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS body_part TEXT,
        ADD COLUMN IF NOT EXISTS classifications TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS style TEXT,
        ADD COLUMN IF NOT EXISTS drill TEXT,
        ADD COLUMN IF NOT EXISTS difficulty TEXT,
        ADD COLUMN IF NOT EXISTS source_url TEXT;

      ALTER TABLE antrenmanlar
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
        ADD COLUMN IF NOT EXISTS rpe NUMERIC,
        ADD COLUMN IF NOT EXISTS tempo TEXT,
        ADD COLUMN IF NOT EXISTS rest_seconds INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS template_id BIGINT;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE uyeler
        ADD COLUMN IF NOT EXISTS boy NUMERIC,
        ADD COLUMN IF NOT EXISTS cinsiyet TEXT,
        ADD COLUMN IF NOT EXISTS kayit_tarihi DATE,
        ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS telefon TEXT,
        ADD COLUMN IF NOT EXISTS dogum_tarihi DATE,
        ADD COLUMN IF NOT EXISTS saglik_gecmisi TEXT,
        ADD COLUMN IF NOT EXISTS alerjiler TEXT,
        ADD COLUMN IF NOT EXISTS beslenme_aliskanliklari TEXT,
        ADD COLUMN IF NOT EXISTS hareket_aliskanliklari TEXT,
        ADD COLUMN IF NOT EXISTS spor_gecmisi TEXT,
        ADD COLUMN IF NOT EXISTS beklentiler TEXT,
        ADD COLUMN IF NOT EXISTS degerlendirme_verileri JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS degerlendirme_tamamlandi BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS degerlendirme_tarihi TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS trainer_id TEXT;

      CREATE TABLE IF NOT EXISTS trainers (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        auth_user_id UUID UNIQUE,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO trainers (id, full_name)
      VALUES ('burak-ozcan', 'Burak Özcan')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
      ALTER TABLE trainers
        ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
      CREATE INDEX IF NOT EXISTS uyeler_auth_user_id_idx ON uyeler (auth_user_id);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uyeler_trainer_id_fkey'
        ) THEN
          ALTER TABLE uyeler ADD CONSTRAINT uyeler_trainer_id_fkey
            FOREIGN KEY (trainer_id) REFERENCES trainers(id);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS weekly_program_schedule (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        trainer_id TEXT NOT NULL DEFAULT 'burak-ozcan' REFERENCES trainers(id),
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        start_time TIME NOT NULL,
        end_time TIME,
        branch TEXT NOT NULL DEFAULT 'Fitness',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, day_of_week, start_time)
      );
      ALTER TABLE weekly_program_schedule
        ADD COLUMN IF NOT EXISTS trainer_id TEXT;
      UPDATE weekly_program_schedule
        SET trainer_id = 'burak-ozcan'
        WHERE trainer_id IS NULL;
      ALTER TABLE weekly_program_schedule
        ALTER COLUMN trainer_id SET DEFAULT 'burak-ozcan',
        ALTER COLUMN trainer_id SET NOT NULL;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'weekly_program_schedule_trainer_id_fkey'
        ) THEN
          ALTER TABLE weekly_program_schedule
            ADD CONSTRAINT weekly_program_schedule_trainer_id_fkey
            FOREIGN KEY (trainer_id) REFERENCES trainers(id);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS push_reminder_deliveries (
        id BIGINT PRIMARY KEY,
        subscription_id BIGINT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
        schedule_id BIGINT NOT NULL REFERENCES weekly_program_schedule(id) ON DELETE CASCADE,
        occurrence_key TEXT NOT NULL,
        reminder_type TEXT NOT NULL CHECK (reminder_type IN ('day-before', 'hour-before')),
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (subscription_id, schedule_id, occurrence_key, reminder_type)
      );

      CREATE TABLE IF NOT EXISTS schedule_notifications (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        schedule_id BIGINT REFERENCES weekly_program_schedule(id) ON DELETE SET NULL,
        action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ,
        push_sent_at TIMESTAMPTZ
      );
      ALTER TABLE schedule_notifications
        ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS schedule_attendance (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        schedule_id BIGINT NOT NULL REFERENCES weekly_program_schedule(id) ON DELETE CASCADE,
        occurrence_date DATE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('attending', 'declined')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, schedule_id, occurrence_date)
      );

      CREATE TABLE IF NOT EXISTS workout_completions (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        workout_id BIGINT NOT NULL REFERENCES antrenmanlar(id) ON DELETE CASCADE,
        exercise_index INTEGER NOT NULL,
        completion_date DATE NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, workout_id, exercise_index, completion_date)
      );

      CREATE TABLE IF NOT EXISTS device_connections (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'watchos', 'web')),
        device_identifier TEXT NOT NULL,
        device_name TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, platform, device_identifier)
      );

      CREATE TABLE IF NOT EXISTS health_metrics (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        device_connection_id BIGINT REFERENCES device_connections(id) ON DELETE SET NULL,
        source TEXT NOT NULL CHECK (source IN ('healthkit', 'manual', 'web')),
        metric_type TEXT NOT NULL,
        value NUMERIC NOT NULL,
        unit TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        external_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, source, metric_type, recorded_at, external_id)
      );

      CREATE TABLE IF NOT EXISTS workout_sessions (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
        device_connection_id BIGINT REFERENCES device_connections(id) ON DELETE SET NULL,
        schedule_id BIGINT REFERENCES weekly_program_schedule(id) ON DELETE SET NULL,
        source TEXT NOT NULL CHECK (source IN ('trainer_pro', 'healthkit', 'manual')),
        activity_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        active_energy_kcal NUMERIC,
        average_heart_rate NUMERIC,
        maximum_heart_rate NUMERIC,
        external_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, source, external_id)
      );

      CREATE TABLE IF NOT EXISTS workout_session_steps (
        id BIGINT PRIMARY KEY,
        workout_session_id BIGINT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        sets INTEGER,
        reps INTEGER,
        weight NUMERIC,
        duration_seconds INTEGER,
        tempo TEXT,
        rest_seconds INTEGER,
        rpe NUMERIC,
        completed BOOLEAN NOT NULL DEFAULT false,
        completed_at TIMESTAMPTZ,
        UNIQUE (workout_session_id, step_index)
      );

      CREATE INDEX IF NOT EXISTS health_metrics_member_recorded_idx
        ON health_metrics (member_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS workout_sessions_member_started_idx
        ON workout_sessions (member_id, started_at DESC);

      UPDATE master_egzersizler
      SET
        body_part = NULLIF(gruplar ->> 'bodyPart', ''),
        classifications = COALESCE(ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(gruplar -> 'classification', '[]'::jsonb))
        ), '{}'),
        style = COALESCE(gruplar ->> 'style', NULLIF(gruplar -> 'styles' ->> 0, '')),
        drill = NULLIF(gruplar ->> 'drill', ''),
        difficulty = NULLIF(gruplar ->> 'level', ''),
        source_url = NULLIF(gruplar ->> 'sourceUrl', '');

      NOTIFY pgrst, 'reload schema';
    `);
    for (const [index, [name, branch, bodyPart, muscles, equipment, level]] of exerciseCatalog.entries()) {
      const taxonomy = deriveExerciseTaxonomy({ name, branch, bodyPart, muscles });
      await client.query(`
        INSERT INTO master_egzersizler
          (id, ad, brans, gruplar, body_part, classifications, style, drill, difficulty, source_url)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (ad) DO UPDATE SET
          brans = EXCLUDED.brans, gruplar = EXCLUDED.gruplar, body_part = EXCLUDED.body_part,
          classifications = EXCLUDED.classifications, style = EXCLUDED.style, drill = EXCLUDED.drill,
          difficulty = EXCLUDED.difficulty, source_url = EXCLUDED.source_url
      `, [
        910000000000 + index,
        name,
        branch,
        JSON.stringify({
          bodyPart,
          muscles,
          branch,
          equipment,
          level,
          source: 'Zen Wellness Club core library',
          ...deriveExerciseTaxonomy({ name, branch, bodyPart, muscles })
        }),
        bodyPart,
        taxonomy.classification,
        taxonomy.styles?.[0] || null,
        taxonomy.drill || null,
        level,
        null
      ]);
    }
    for (const [index, exercise] of extendedExerciseCatalog.entries()) {
      await client.query(`
        INSERT INTO master_egzersizler
          (id, ad, brans, gruplar, body_part, classifications, style, drill, difficulty, source_url)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (ad) DO UPDATE SET
          brans = EXCLUDED.brans, gruplar = EXCLUDED.gruplar, body_part = EXCLUDED.body_part,
          classifications = EXCLUDED.classifications, style = EXCLUDED.style, drill = EXCLUDED.drill,
          difficulty = EXCLUDED.difficulty, source_url = EXCLUDED.source_url
      `, [
        920000000000 + index,
        exercise.name,
        exercise.branch,
        JSON.stringify({
          bodyPart: exercise.bodyPart,
          muscles: exercise.muscles,
          branch: exercise.branch,
          equipment: exercise.equipment,
          level: exercise.level,
          classification: exercise.classification,
          styles: exercise.styles,
          drill: exercise.drill,
          sanskritName: exercise.sanskritName,
          japaneseName: exercise.japaneseName,
          source: exercise.source,
          sourceUrl: exercise.sourceUrl
        }),
        exercise.bodyPart,
        exercise.classification,
        exercise.styles?.[0] || null,
        exercise.drill || null,
        exercise.level,
        exercise.sourceUrl || null
      ]);
    }
    for (const [index, exercise] of karateShotokanCatalog.entries()) {
      await client.query(`
        INSERT INTO master_egzersizler
          (id, ad, brans, gruplar, body_part, classifications, style, drill, difficulty, source_url)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (ad) DO UPDATE SET
          brans = EXCLUDED.brans, gruplar = EXCLUDED.gruplar, body_part = EXCLUDED.body_part,
          classifications = EXCLUDED.classifications, style = EXCLUDED.style, drill = EXCLUDED.drill,
          difficulty = EXCLUDED.difficulty, source_url = EXCLUDED.source_url
      `, [
        930000000000 + index,
        exercise.name,
        exercise.branch,
        JSON.stringify(exercise),
        exercise.bodyPart,
        exercise.classification,
        exercise.style || null,
        exercise.drill,
        exercise.level,
        exercise.sourceUrl
      ]);
    }
    await client.query(`
      INSERT INTO schema_migrations (version)
      VALUES ('2026-11-01-data-foundation')
      ON CONFLICT (version) DO NOTHING
    `);
    console.log('Migration successful.');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
