/**
 * Zen Wellness Club - Yönetici SPA
 * Optimized for Batoner Mobile App Studios Standards
 * Version 1.3.86 - Modal Workout Edition
 */

 document.addEventListener('DOMContentLoaded', () => {
    // --- CACHE BUSTER ---
    const APP_VERSION = '1.3.114';
    const vTag = document.getElementById('version-tag');
    if (vTag) vTag.innerText = `v${APP_VERSION} - Realtime Sync`;
    let activeLoginRole = 'admin';
    let activeAuthMode = 'login';
    window.showPortalRoles = () => {
        const roles = document.getElementById('portal-roles');
        if (roles) roles.hidden = !roles.hidden;
    };
    const AUTH_TIMEOUT_MS = 10000;
    const withAuthTimeout = (promise, message) => Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
        })
    ]);

    window.enterPortal = async (role) => {
        if (role === 'user') {
            activeLoginRole = 'user';
            activeAuthMode = 'login';
            document.querySelector('#modal-auth h2').textContent = 'Danışan Girişi';
            document.querySelector('#modal-auth .auth-copy').textContent =
                'Zen Wellness Club gelişim panelinize devam etmek için giriş yapın.';
            configureUserAuthForm();
        } else if (role === 'admin') {
            activeLoginRole = 'admin';
            activeAuthMode = 'login';
            document.querySelector('#modal-auth h2').textContent = 'Yönetici Girişi';
            document.querySelector('#modal-auth .auth-copy').textContent =
                'Zen Wellness Club yönetim paneline devam etmek için giriş yapın.';
            configureAdminAuthForm();
        } else {
            return;
        }
        showAuthError('');
        window.openModal('modal-auth');
        window.setTimeout(() => document.getElementById('auth-email')?.focus(), 0);
        try {
            const { data, error } = await withAuthTimeout(
                supabase.auth.getSession(),
                'Oturum kontrolü zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
            );
            if (error || !data.session) {
                return;
            }
            const validSession = activeLoginRole === 'admin'
                ? isAdminSession(data.session)
                : isMemberSession(data.session);
            if (!validSession) {
                showAuthError(activeLoginRole === 'admin'
                    ? 'Bu hesap yönetici yetkisine sahip değil.'
                    : 'Bu hesap danışan yetkisine sahip değil.');
                return;
            }
            if (activeLoginRole === 'admin') enterAdminPortal();
            else enterMemberPortal();
        } catch (error) {
            handleError(error, 'Admin session check');
            showAuthError(error.message);
            window.openModal('modal-auth');
        }
    };
    const configureUserAuthForm = () => {
        const label = document.getElementById('auth-identity-label');
        const input = document.getElementById('auth-email');
        const signup = document.getElementById('auth-signup-toggle');
        const reset = document.getElementById('auth-reset-button');
        if (label) label.textContent = 'E-posta';
        if (input) {
            input.type = 'email';
            input.placeholder = '';
            input.removeAttribute('pattern');
            input.autocomplete = 'username';
        }
        if (signup) signup.hidden = false;
        if (reset) reset.hidden = false;
        const copy = document.getElementById('auth-signup-copy');
        if (copy) copy.hidden = activeAuthMode !== 'signup';
    };
    const configureAdminAuthForm = () => {
        const label = document.getElementById('auth-identity-label');
        const input = document.getElementById('auth-email');
        const signup = document.getElementById('auth-signup-toggle');
        const reset = document.getElementById('auth-reset-button');
        const copy = document.getElementById('auth-signup-copy');
        if (label) label.textContent = 'E-posta';
        if (input) {
            input.type = 'email';
            input.placeholder = '';
            input.removeAttribute('pattern');
            input.autocomplete = 'username';
        }
        if (signup) signup.hidden = true;
        if (reset) reset.hidden = false;
        if (copy) copy.hidden = true;
    };
    window.toggleMemberSignup = () => {
        if (activeLoginRole !== 'user') return;
        activeAuthMode = activeAuthMode === 'signup' ? 'login' : 'signup';
        const title = document.querySelector('#modal-auth h2');
        const submit = document.querySelector('#modal-auth button[type="submit"]');
        const toggle = document.getElementById('auth-signup-toggle');
        const copy = document.getElementById('auth-signup-copy');
        if (title) title.textContent = activeAuthMode === 'signup' ? 'Danışan Kaydı' : 'Danışan Girişi';
        if (submit) submit.textContent = activeAuthMode === 'signup' ? 'Kayıt Ol' : 'Giriş Yap';
        if (toggle) toggle.textContent = activeAuthMode === 'signup' ? 'Giriş Yap' : 'Kayıt Ol';
        if (copy) copy.hidden = activeAuthMode !== 'signup';
        showAuthError('');
    };
    window.requestPasswordReset = async () => {
        const identity = document.getElementById('auth-email')?.value.trim();
        if (!identity) {
            showAuthError('Önce e-posta adresinizi girin.');
            document.getElementById('auth-email')?.focus();
            return;
        }
        try {
            const { error } = await withAuthTimeout(
                supabase.auth.resetPasswordForEmail(identity, {
                    redirectTo: `${window.location.origin}${window.location.pathname}?reset=1`
                }),
                'Şifre sıfırlama isteği zaman aşımına uğradı.'
            );
            if (error) throw error;
            showAuthError('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.');
        } catch (error) {
            handleError(error, 'Password reset');
            showAuthError('Şifre sıfırlama bağlantısı gönderilemedi.');
        }
    };
    const isAdminSession = (session) => session?.user?.app_metadata?.role === 'admin';
    const isMemberSession = (session) => session?.user?.app_metadata?.role === 'user';
    const showAuthError = (message) => {
        const errorElement = document.getElementById('auth-error');
        if (errorElement) errorElement.textContent = message;
    };
    const enterAdminPortal = () => {
        document.body.classList.add('portal-entered');
        document.getElementById('brand-splash')?.classList.add('is-hidden');
        init();
    };
    let activeMemberPortalMemberId = null;
    let activeMemberPortalTab = 'overview';
    const enterMemberPortal = () => {
        document.body.classList.add('member-portal-active');
        document.getElementById('brand-splash')?.classList.add('is-hidden');
        document.getElementById('app-wrapper')?.setAttribute('hidden', '');
        document.getElementById('member-portal')?.removeAttribute('hidden');
        loadMemberPortal();
    };
    const createScheduleNotification = async ({ memberId, scheduleId = null, action, message }) => {
        const { error } = await dataService.mutate('schedule_notifications', 'insert', {
            id: Date.now(),
            member_id: memberId,
            schedule_id: scheduleId,
            action,
            message
        });
        if (error) {
            handleError(error, 'Schedule notification');
        }
    };
    const exitAdminPortal = () => {
        document.body.classList.remove('member-portal-active');
        document.body.classList.remove('portal-entered');
        document.getElementById('brand-splash')?.classList.remove('is-hidden');
        document.getElementById('portal-roles').hidden = true;
        document.getElementById('app-wrapper')?.removeAttribute('hidden');
        document.getElementById('member-portal')?.setAttribute('hidden', '');
        window.clearInterval(memberNotificationTimer);
        memberNotificationTimer = null;
        memberNotificationMember = null;
        memberNotificationSchedules = [];
        window.closeModal('modal-auth');
        setSyncStatus('offline', 'Yönetici girişi bekleniyor');
        if (realtimeChannel) {
            // Release our reference first: the CLOSED status fires synchronously during removal,
            // and the subscribe callback ignores channels that are no longer current.
            const closingChannel = realtimeChannel;
            realtimeChannel = null;
            supabase.removeChannel(closingChannel);
        }
        window.clearTimeout(realtimeSyncTimer);
        window.clearTimeout(realtimeReconnectTimer);
        // Reset the id too: scheduleRealtimeReconnect() skips scheduling while it is set.
        realtimeReconnectTimer = null;
        document.querySelector('.fab')?.remove();
        initialized = false;
    };
    try {
        localStorage.setItem('app_version', APP_VERSION);
    } catch(e) {
        console.warn("Could not save version to localStorage");
    }

    // --- CONFIGURATION ---
    const CONFIG = {
        SUPABASE_URL: 'https://mdcvljbbnoxqsfwcjvqz.supabase.co',
        SUPABASE_KEY: 'sb_publishable_cR0_yg6oxqfP4mAcPTL4Bw_ZhW16sSr',
        VAPID_PUBLIC_KEY: 'BA4GRDmB8WDBMjgK8HRuqN7LuYUKgCKpaFLzpVjkjmxvA73_8pqWDZ10zhOBpmGMoKdqqKy1cGEqgQP7FBym-k8',
        IS_DEV: true
    };

    const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    const dataService = window.TrainerProDataService.create(supabase);
    window.addEventListener('trainerpro-sync-queue', event => {
        const pending = event.detail?.pending || 0;
        if (pending > 0) setSyncStatus('syncing', `${pending} çevrimdışı işlem bekliyor`);
        else if (navigator.onLine) {
            setSyncStatus('online', 'Senkronize edildi');
            sync().catch(error => handleError(error, 'Queued sync refresh'));
        }
    });
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            window.setTimeout(async () => {
                const password = window.prompt('Yeni şifrenizi girin:');
                if (!password || password.length < 8) {
                    showAuthError('Yeni şifre en az 8 karakter olmalıdır.');
                    return;
                }
                const { error } = await supabase.auth.updateUser({ password });
                if (error) {
                    handleError(error, 'Password update');
                    showAuthError('Yeni şifre kaydedilemedi.');
                    return;
                }
                showAuthError('Şifreniz güncellendi. Giriş yapabilirsiniz.');
                await supabase.auth.signOut();
            }, 0);
            return;
        }
        if (event === 'SIGNED_OUT') {
            exitAdminPortal();
            return;
        }
        if (event === 'SIGNED_IN' && window.location.hash.includes('access_token') && session) {
            if (isMemberSession(session)) enterMemberPortal();
            else if (isAdminSession(session)) enterAdminPortal();
        }
        if (event === 'TOKEN_REFRESHED' && !isAdminSession(session) && !isMemberSession(session)) {
            exitAdminPortal();
        }
    });
    window.handleAdminLogout = async () => {
        try {
            const { error } = await withAuthTimeout(
                supabase.auth.signOut(),
                'Çıkış işlemi zaman aşımına uğradı.'
            );
            if (error) throw error;
            exitAdminPortal();
        } catch (error) {
            handleError(error, 'Admin logout');
            alert('Çıkış yapılamadı. Lütfen tekrar deneyin.');
        }
    };
    window.exportMyData = async () => {
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const userId = sessionData.session?.user?.id;
            if (!userId) throw new Error('Active session not found.');
            const member = state.members.find(item => item.auth_user_id === userId);
            if (!member) throw new Error('Member profile not found.');
            const memberId = member.id;
            const exportData = {
                exportedAt: new Date().toISOString(),
                profile: member,
                measurements: state.measurements.filter(item => item.member_id === memberId),
                workouts: state.workouts.filter(item => item.member_id === memberId),
                schedules: state.schedules.filter(item => item.member_id === memberId),
                healthMetrics: state.healthMetrics.filter(item => item.member_id === memberId),
                workoutSessions: state.workoutSessions.filter(item => item.member_id === memberId)
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `trainer-pro-veriler-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            handleError(error, 'Data export');
            alert('Veriler dışa aktarılamadı. Lütfen tekrar deneyin.');
        }
    };
    window.handleAdminLogin = async (event) => {
        event.preventDefault();
        const errorElement = document.getElementById('auth-error');
        const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
        const identity = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const fullName = document.getElementById('auth-name')?.value.trim();
        if (errorElement) errorElement.textContent = '';
        if (submitButton) submitButton.disabled = true;
        try {
            const authRequest = activeAuthMode === 'signup'
                ? supabase.auth.signUp({
                    email: identity,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
                        data: { full_name: fullName }
                    }
                })
                : activeLoginRole === 'admin'
                    ? supabase.auth.signInWithPassword({ email: identity, password })
                    : supabase.auth.signInWithPassword({ email: identity, password });
            const { data: authData, error } = await withAuthTimeout(
                authRequest,
                activeAuthMode === 'signup'
                    ? 'Kayıt işlemi zaman aşımına uğradı.'
                    : 'Giriş işlemi zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
            );
            if (error) {
                showAuthError(error.message || 'Kimlik bilgileri geçersiz.');
                return;
            }
            if (activeAuthMode === 'signup' && !authData.session) {
                showAuthError('Kayıt oluşturuldu. E-posta kutunuzu doğrulayın; ardından giriş yapın.');
                return;
            }
            const { data: sessionData } = await withAuthTimeout(
                supabase.auth.getSession(),
                'Oturum doğrulaması zaman aşımına uğradı.'
            );
            const validSession = activeLoginRole === 'admin'
                ? isAdminSession(sessionData.session)
                : isMemberSession(sessionData.session);
            if (!validSession) {
                await supabase.auth.signOut();
                showAuthError(activeLoginRole === 'admin'
                    ? 'Bu hesap yönetici yetkisine sahip değil.'
                    : 'Bu hesap danışan yetkisine sahip değil.');
                return;
            }
            window.closeModal('modal-auth');
            if (activeLoginRole === 'admin') enterAdminPortal();
            else enterMemberPortal();
        } catch (error) {
            handleError(error, 'Admin login');
            showAuthError(error.message);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    };

    let state = {
        members: [], exercises: [], programs: [], measurements: [], workouts: [], documents: [], schedules: [], cloudFiles: [],
        foods: [], diets: [], healthMetrics: [], workoutSessions: [], deviceConnections: [],
        activeWorkoutSession: null,
        activeMemberId: null, undoStack: [], navHistory: ['members-view'],
        surveyAnswers: {}, currentStep: 0, measurementRequired: false,
        assessmentStep: 0, assessmentAnswers: {}, assessmentMember: null
    };

    // Escape any database/user text before it is placed into innerHTML.
    const escapeHtml = (value) => String(value ?? '')
        .replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    // Encode a value as a JS literal for use inside an inline handler, e.g. onclick="fn(${jsAttr(x)})".
    const jsAttr = (value) => escapeHtml(JSON.stringify(value ?? ''));
    const escapePortalText = (value) => escapeHtml(value ?? '--');

    let memberNotificationTimer = null;
    let memberNotificationSchedules = [];
    let memberNotificationMember = null;

    const getNextScheduleOccurrence = (dayOfWeek, time) => {
        const now = new Date();
        const today = (now.getDay() + 6) % 7 + 1;
        const daysUntil = (Number(dayOfWeek) - today + 7) % 7;
        const occurrence = new Date(now);
        occurrence.setDate(now.getDate() + daysUntil);
        const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
        occurrence.setHours(hours, minutes, 0, 0);
        if (occurrence <= now) occurrence.setDate(occurrence.getDate() + 7);
        return occurrence;
    };

    const notifyMemberSession = (schedule, offsetLabel, occurrence) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const key = `trainerpro-notification:${schedule.id}:${occurrence.toISOString()}:${offsetLabel}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        new Notification('Zen Wellness Club seans hatırlatması', {
            body: `${getScheduleDayName(schedule.day_of_week)} ${schedule.start_time.slice(0, 5)} · ${schedule.branch} seansınız ${offsetLabel}.`,
            icon: 'zen-wellness-logo.png'
        });
    };

    const decodeVapidKey = value => {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    };

    async function registerMemberPushSubscription(member) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            throw new Error('Bu tarayıcı gerçek push bildirimlerini desteklemiyor.');
        }
        if (!CONFIG.VAPID_PUBLIC_KEY) {
            throw new Error('Push bildirim anahtarı henüz yapılandırılmadı.');
        }
        await navigator.serviceWorker.register('./sw.js', { scope: './' });
        // A freshly registered worker is still installing; subscribe() needs an active one.
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeVapidKey(CONFIG.VAPID_PUBLIC_KEY)
        });
        const { endpoint, keys } = subscription.toJSON();
        const { error } = await dataService.mutate('push_subscriptions', 'upsert', {
            id: Date.now(),
            member_id: member.id,
            endpoint,
            p256dh: keys?.p256dh,
            auth: keys?.auth,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString()
        }, { onConflict: 'endpoint' });
        if (error) throw error;
    }

    function checkMemberNotifications() {
        if (!memberNotificationMember || !memberNotificationSchedules.length) return;
        const now = Date.now();
        memberNotificationSchedules.forEach(schedule => {
            const occurrence = getNextScheduleOccurrence(schedule.day_of_week, schedule.start_time);
            [24 * 60 * 60 * 1000, 60 * 60 * 1000].forEach(offset => {
                const remaining = occurrence.getTime() - now;
                if (remaining >= offset - 30 * 1000 && remaining <= offset + 30 * 1000) {
                    notifyMemberSession(schedule, offset === 3600000 ? '1 saat sonra' : '1 gün sonra', occurrence);
                }
            });
        });
    }

    async function updateMemberNotificationStatus(pushEnabled = false) {
        const status = document.getElementById('member-notification-status');
        if (!status) return;
        const actions = status.closest('.member-portal-notification')?.querySelector('.member-notification-actions');
        // Buttons in render order: enable, test, disable. Their visibility must reflect THIS device's
        // subscription, not whether the member has a subscription on some other device.
        const [enableButton, testButton, disableButton] = actions ? actions.querySelectorAll('button') : [];
        const showButtonsForDevice = subscribed => {
            if (enableButton) enableButton.hidden = subscribed;
            if (testButton) testButton.hidden = !subscribed;
            if (disableButton) disableButton.hidden = !subscribed;
        };
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            status.textContent = 'Bu iPhone/PWA kurulumu gerçek push bildirimlerini desteklemiyor.';
            showButtonsForDevice(false);
            if (enableButton) enableButton.hidden = true;
            return;
        }
        if (Notification.permission === 'denied') {
            status.textContent = 'Bildirim izni kapalı. iPhone Ayarları > Bildirimler bölümünden izin verin.';
            showButtonsForDevice(false);
            return;
        }
        if (Notification.permission !== 'granted') {
            status.textContent = 'Bildirimleri etkinleştir düğmesine basarak izin verin.';
            showButtonsForDevice(false);
            return;
        }
        if (pushEnabled) {
            status.textContent = 'Push bildirimleri aktif: 1 gün ve 1 saat önce hatırlatılacaksınız.';
        }
        try {
            // getRegistration resolves to undefined when no service worker exists;
            // serviceWorker.ready would wait forever on a device that never enabled push.
            const registration = await navigator.serviceWorker.getRegistration('./');
            const subscription = registration ? await registration.pushManager.getSubscription() : null;
            if (subscription) {
                status.textContent = 'Push bildirimleri aktif: 1 gün ve 1 saat önce hatırlatılacaksınız.';
                showButtonsForDevice(true);
            } else {
                status.textContent = 'İzin verildi ancak cihaz aboneliği bulunamadı. Bildirimleri tekrar etkinleştirin.';
                showButtonsForDevice(false);
            }
        } catch (error) {
            handleError(error, 'Member push status');
            status.textContent = 'Push aboneliği doğrulanamadı. Bildirimleri tekrar etkinleştirin.';
        }
    }

    async function startMemberNotifications(member, schedules, pushEnabled) {
        memberNotificationMember = member;
        memberNotificationSchedules = schedules;
        window.clearInterval(memberNotificationTimer);
        memberNotificationTimer = window.setInterval(checkMemberNotifications, 30000);
        checkMemberNotifications();
        await updateMemberNotificationStatus(pushEnabled);
    }

    window.enableMemberNotifications = async () => {
        const status = document.getElementById('member-notification-status');
        if (!('Notification' in window)) {
            if (status) status.textContent = 'Bu tarayıcı bildirimleri desteklemiyor.';
            return;
        }
        try {
            if (Notification.permission === 'default') await Notification.requestPermission();
            if (Notification.permission !== 'granted') throw new Error('Bildirim izni verilmedi.');
            await registerMemberPushSubscription(memberNotificationMember);
        } catch (error) {
            handleError(error, 'Member push subscription');
            if (status) status.textContent = error.message;
            return;
        }
        if (status) {
            await updateMemberNotificationStatus(true);
        }
    };

    window.sendTestNotification = async () => {
        const registration = await navigator.serviceWorker.getRegistration('./');
        if (!registration) {
            alert('Push servisi henüz kurulmamış. Önce bildirimleri etkinleştirin.');
            return;
        }
        await registration.showNotification('Zen Wellness Club test bildirimi', {
            body: 'iPhone push bildirimi başarıyla çalışıyor.',
            icon: 'zen-wellness-icon.png',
            tag: 'trainer-pro-test',
            // Without renotify, a repeat test silently replaces the previous notification.
            renotify: true
        });
        checkMemberNotifications();
    };

    window.disableMemberNotifications = async () => {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                const { error } = await supabase.from('push_subscriptions')
                    .delete().eq('endpoint', subscription.endpoint);
                if (error) throw error;
                await subscription.unsubscribe();
            }
            await loadMemberPortal();
        } catch (error) {
            handleError(error, 'Member push unsubscribe');
            alert(`Bildirimler kapatılamadı: ${error.message}`);
        }
    };

    const renderMemberPortal = ({ member, measurements, workouts, diets, documents, schedules, deliveries, notifications = [], attendance = [], completions = [], pushEnabled }) => {
        // Re-renders after a save keep the member on their current tab; a different member starts on overview.
        const isSameMember = activeMemberPortalMemberId === member.id;
        activeMemberPortalMemberId = member.id;
        const sortedMeasurements = [...measurements].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        const sortedWorkouts = [...workouts].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        const sortedDiets = [...diets].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        const sortedSchedules = [...schedules].sort((a, b) =>
            Number(a.day_of_week) - Number(b.day_of_week) || a.start_time.localeCompare(b.start_time));
        const sortedDeliveries = [...deliveries].sort((a, b) =>
            new Date(b.delivered_at) - new Date(a.delivered_at));
        const sortedNotifications = [...notifications].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at));
        const attendanceByKey = new Map(attendance.map(item => [`${item.schedule_id}:${item.occurrence_date}`, item.status]));
        const completionByKey = new Map(completions.map(item => [`${item.workout_id}:${item.exercise_index}:${item.completion_date}`, item.completed]));
        const todayDate = new Date().toISOString().slice(0, 10);
        const dailyExercises = sortedWorkouts.flatMap(workout => {
            const sets = window.safeJSONParse(workout.setler, []);
            return sets.map((set, index) => ({ workout, set, index }));
        });
        const exerciseMarkup = dailyExercises.length ? dailyExercises.map(({ workout, set, index }) => {
            const key = `${workout.id}:${index}:${todayDate}`;
            const completed = completionByKey.get(key);
            return `<li class="member-exercise-item">
                <span><strong>${escapePortalText(set.ad || 'Egzersiz')}</strong><small>${escapePortalText(workout.sablon || 'Antrenman')} · ${escapePortalText(set.set || set.tekrar || '')}</small></span>
                <button class="btn-secondary" type="button" onclick="window.toggleWorkoutExercise(${workout.id}, ${index}, ${completed ? 'false' : 'true'})">${completed ? 'Tamamlandı ✓' : 'Tamamla'}</button>
            </li>`;
        }).join('') : '<p class="member-portal-muted">Bugün için egzersiz listesi bulunmuyor.</p>';
        const nextOccurrenceDate = day => {
            const today = new Date();
            const todayDay = today.getDay() || 7;
            const offset = (Number(day) - todayDay + 7) % 7;
            today.setDate(today.getDate() + offset);
            return today.toISOString().slice(0, 10);
        };
        const calendarMarkup = scheduleDays.map(([day, label]) => {
            const daySchedules = sortedSchedules.filter(item => Number(item.day_of_week) === day);
            return `<div class="member-calendar-day"><strong>${label}</strong>${daySchedules.length ? daySchedules.map(item => {
                const date = nextOccurrenceDate(day);
                const key = `${item.id}:${date}`;
                const status = attendanceByKey.get(key);
                return `<div class="member-calendar-session">
                    <span>${escapePortalText(item.start_time.slice(0, 5))} · ${escapePortalText(item.branch)}</span>
                    <button class="btn-secondary" type="button" onclick="window.toggleScheduleAttendance(${item.id}, '${date}', '${status === 'attending' ? 'declined' : 'attending'}')">${status === 'attending' ? 'Katılacağım ✓' : status === 'declined' ? 'Katılmayacağım' : 'Katılacağım'}</button>
                </div>`;
            }).join('') : '<span class="member-portal-muted">Seans yok</span>'}</div>`;
        }).join('');
        const scheduleById = new Map(sortedSchedules.map(schedule => [String(schedule.id), schedule]));
        const latest = sortedMeasurements[0];
        const metrics = [
            ['Kilo', latest?.weight, 'kg'],
            ['Yağ oranı', latest?.fat, '%'],
            ['Göğüs', latest?.chest, 'cm'],
            ['Bel', latest?.waist, 'cm']
        ];
        const content = document.getElementById('member-portal-content');
        if (!content) return;
        content.innerHTML = `
            <section class="member-portal-card member-portal-section" data-portal-section="overview">
                <p class="member-portal-muted">Hoş geldiniz</p>
                <h1>${escapePortalText(member.ad_soyad)}</h1>
                <p class="member-portal-muted">${latest ? `Son ölçüm: ${escapePortalText(latest.tarih)}` : 'Henüz ölçüm kaydı bulunmuyor.'}</p>
                <div class="member-portal-notification">
                    <strong>Seans hatırlatmaları</strong>
                    <span id="member-notification-status">${pushEnabled ? 'Push bildirimleri aktif: 1 gün ve 1 saat önce hatırlatılacaksınız.' : '24 saat ve 1 saat önce bildirim almak için izin verin.'}</span>
                    <div class="member-notification-actions">
                        <button class="btn-secondary" type="button" ${pushEnabled ? 'hidden' : ''} onclick="window.enableMemberNotifications()">Bildirimleri etkinleştir</button>
                        <button class="btn-secondary" type="button" onclick="window.sendTestNotification()">Test bildirimi</button>
                        <button class="btn-secondary" type="button" ${pushEnabled ? '' : 'hidden'} onclick="window.disableMemberNotifications()">Bu cihazda kapat</button>
                    </div>
                </div>
            </section>
            <section class="member-portal-card member-portal-section" data-portal-section="schedule">
                <h2>🗓️ Haftalık programım</h2>
                <div class="member-schedule-calendar">${calendarMarkup}</div>
                ${sortedSchedules.length ? `<ul class="member-portal-list member-schedule-list">${sortedSchedules.map(item => `
                    <li>
                        <strong>${escapePortalText(getScheduleDayName(item.day_of_week))}</strong>
                        <span>${escapePortalText(item.start_time.slice(0, 5))} - ${escapePortalText(item.end_time?.slice(0, 5) || '--:--')}</span>
                        <b>${escapePortalText(item.branch)}</b>
                        ${item.notes ? `<small>${escapePortalText(item.notes)}</small>` : ''}
                    </li>`).join('')}</ul>` : '<p class="member-portal-muted">Henüz haftalık seans atanmadı.</p>'}
            </section>
            <section class="member-portal-card member-portal-section" data-portal-section="notifications">
                <h2>🔔 Bildirim Merkezi</h2>
                <p class="member-portal-muted">Bu cihazdaki seans hatırlatmaları ve gönderim geçmişi.</p>
                ${sortedNotifications.length ? `<ul class="member-portal-list member-notification-history">${sortedNotifications.slice(0, 20).map(notification => `
                    <li>
                        <strong>${escapePortalText(notification.action === 'deleted' ? 'Seans kaldırıldı' : notification.action === 'created' ? 'Yeni seans eklendi' : 'Seans güncellendi')}</strong>
                        <span>${escapePortalText(notification.message)} · ${escapePortalText(new Date(notification.created_at).toLocaleString('tr-TR'))}</span>
                    </li>
                `).join('')}</ul>` : ''}
                ${sortedDeliveries.length ? `<ul class="member-portal-list member-notification-history">${sortedDeliveries.slice(0, 20).map(delivery => {
                    const schedule = scheduleById.get(String(delivery.schedule_id));
                    const timing = delivery.reminder_type === 'day-before' ? '1 gün önce' : '1 saat önce';
                    return `<li>
                        <strong>${escapePortalText(schedule ? `${getScheduleDayName(schedule.day_of_week)} ${schedule.start_time.slice(0, 5)} · ${schedule.branch}` : 'Seans hatırlatması')}</strong>
                        <span>${escapePortalText(timing)} · ${escapePortalText(new Date(delivery.delivered_at).toLocaleString('tr-TR'))}</span>
                    </li>`;
                }).join('')}</ul>` : '<p class="member-portal-muted">Henüz gönderilmiş seans bildirimi yok.</p>'}
            </section>
            <div class="member-portal-grid" style="margin-top:1rem">
                <section class="member-portal-card member-portal-section" data-portal-section="measurements">
                    <h2 style="margin-bottom:1rem; color:var(--accent);">📊 Vücut Ölçümleri & Analiz</h2>

                    <div class="member-portal-grid" style="margin-bottom: 1.5rem; background:rgba(255,255,255,0.02); padding:1rem; border-radius:12px;">
                        ${metrics.map(([label, value, unit]) => `
                            <div><span class="member-portal-muted">${label}</span><h3>${escapePortalText(value)} ${unit}</h3></div>
                        `).join('')}
                    </div>

                    <h3 style="margin-bottom:1rem; font-size:1rem; color:var(--primary);">🫀 Kardiyo ve Metabolizma (Son Test)</h3>
                    ${(() => {
                        const cardioData = sortedMeasurements.find(m => m.rhr || m.bmr || m.vo2max);
                        if (!cardioData) return '<p class="member-portal-muted">Henüz kardiyo ve metabolizma test kaydı bulunmuyor.</p>';
                        return `
                        <div class="member-portal-grid" style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:12px;">
                            <div><span class="member-portal-muted">VO2 Max</span><h3>${cardioData.vo2max || '--'}</h3></div>
                            <div><span class="member-portal-muted">Dinlenik Nabız</span><h3>${cardioData.rhr || '--'} bpm</h3></div>
                            <div><span class="member-portal-muted">BMR (Bazal Met.)</span><h3>${cardioData.bmr || '--'} kcal</h3></div>
                            <div><span class="member-portal-muted">Nabız Rezervi</span><h3>${cardioData.hrr || '--'} bpm</h3></div>
                        </div>`;
                    })()}
                </section>

                <section class="member-portal-card member-portal-section" data-portal-section="workouts">
                    <h2 style="margin-bottom:1rem; color:var(--accent);">🏋️ Günlük egzersizler</h2>
                    <ul class="member-portal-list member-exercise-list">${exerciseMarkup}</ul>
                    <h3 style="margin:1rem 0 0.75rem;">Antrenman geçmişi</h3>
                    ${sortedWorkouts.length ? `<ul class="member-portal-list">${sortedWorkouts.slice(0, 10).map(workout => `
                        <li style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; margin-bottom:0.5rem; border:1px solid rgba(255,255,255,0.05);">
                            <strong>${escapePortalText(workout.sablon || 'Antrenman')}</strong><br>
                            <span class="member-portal-muted">${escapePortalText(workout.tarih)}</span>
                        </li>
                    `).join('')}</ul>` : '<p class="member-portal-muted">Henüz antrenman kaydı bulunmuyor.</p>'}
                </section>

                <section class="member-portal-card member-portal-section" data-portal-section="nutrition">
                    <h2 style="margin-bottom:1rem; color:var(--accent);">🍏 Beslenme planları</h2>
                    ${sortedDiets.length ? `<ul class="member-portal-list">${sortedDiets.map(diet => {
                        const meals = window.safeJSONParse(diet.ogunler, []);
                        let tCal = 0, tPro = 0, tCarb = 0, tFat = 0;
                        meals.forEach(m => {
                            tCal += m.kalori || 0; tPro += m.protein || 0; tCarb += m.karbonhidrat || 0; tFat += m.yag || 0;
                        });
                        return `
                        <li style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; margin-bottom:0.5rem; border:1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                <strong>${escapePortalText(diet.plan_adi || 'Beslenme planı')}</strong>
                                <span class="member-portal-muted">${escapePortalText(diet.tarih)}</span>
                            </div>
                            <div style="display:flex; gap:0.5rem; font-size:0.75rem; color:var(--text-dim); flex-wrap:wrap;">
                                <span style="background:rgba(255,165,0,0.1); color:orange; padding:0.2rem 0.5rem; border-radius:4px;">🔥 ${tCal.toFixed(0)} kcal</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">P: ${tPro.toFixed(0)}g</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">C: ${tCarb.toFixed(0)}g</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">Y: ${tFat.toFixed(0)}g</span>
                            </div>
                        </li>`;
                    }).join('')}</ul>` : '<p class="member-portal-muted">Henüz beslenme planı bulunmuyor.</p>'}
                </section>
                <section class="member-portal-card member-portal-section" data-portal-section="documents">
                    <h2>📄 Belgeler</h2>
                    ${documents.length ? `<ul class="member-portal-list">${documents.map(document => `
                        <li><strong>${escapePortalText(document.adi || 'Belge')}</strong><br>
                        <span class="member-portal-muted">${escapePortalText(document.tip)}</span></li>
                    `).join('')}</ul>` : '<p class="member-portal-muted">Henüz belge bulunmuyor.</p>'}
                </section>
            </div>`;
        window.selectMemberPortalTab(isSameMember ? activeMemberPortalTab : 'overview');
        startMemberNotifications(member, sortedSchedules, pushEnabled);
    };

    window.toggleScheduleAttendance = async (scheduleId, occurrenceDate, status) => {
        if (!activeMemberPortalMemberId) return;
        const { error } = await dataService.mutate('schedule_attendance', 'upsert', {
            id: Date.now(),
            member_id: activeMemberPortalMemberId,
            schedule_id: scheduleId,
            occurrence_date: occurrenceDate,
            status,
            updated_at: new Date().toISOString()
        }, { onConflict: 'member_id,schedule_id,occurrence_date' });
        if (error) {
            handleError(error, 'Schedule attendance');
            alert(`Katılım durumu kaydedilemedi: ${error.message}`);
            return;
        }
        await loadMemberPortal();
    };

    window.toggleWorkoutExercise = async (workoutId, exerciseIndex, completed) => {
        if (!activeMemberPortalMemberId) return;
        const { error } = await dataService.mutate('workout_completions', 'upsert', {
            id: Date.now(),
            member_id: activeMemberPortalMemberId,
            workout_id: workoutId,
            exercise_index: exerciseIndex,
            completion_date: new Date().toISOString().slice(0, 10),
            completed,
            updated_at: new Date().toISOString()
        }, { onConflict: 'member_id,workout_id,exercise_index,completion_date' });
        if (error) {
            handleError(error, 'Workout completion');
            alert(`Egzersiz durumu kaydedilemedi: ${error.message}`);
            return;
        }
        await loadMemberPortal();
    };

    window.selectMemberPortalTab = (tab) => {
        activeMemberPortalTab = tab;
        document.querySelectorAll('[data-portal-section]').forEach(section => {
            section.hidden = section.dataset.portalSection !== tab;
        });
        document.querySelectorAll('[data-portal-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.portalTab === tab);
        });
    };

    const assessmentQuestions = [
        { key: 'ad_soyad', title: 'Adınız ve soyadınız nedir?', type: 'text', label: 'Ad Soyad', required: true },
        { key: 'telefon', title: 'Size hangi cep telefonu numarasından ulaşabiliriz?', type: 'tel', label: 'Cep telefonu', required: true },
        { key: 'dogum_tarihi', title: 'Doğum tarihiniz nedir?', type: 'date', label: 'Doğum tarihi', required: true },
        {
            key: 'cinsiyet', title: 'Cinsiyetinizi nasıl belirtmek istersiniz?', type: 'radio',
            options: ['Kadın', 'Erkek', 'Belirtmek istemiyorum'], required: true
        },
        { key: 'boy', title: 'Boyunuz ve mevcut kilonuz nedir?', type: 'body', required: true },
        {
            key: 'saglik_gecmisi', title: 'Bilmemiz gereken bir hastalık geçmişiniz var mı?', type: 'textarea',
            placeholder: 'Yoksa “Yok” yazabilirsiniz.', required: true
        },
        {
            key: 'alerjiler', title: 'Alerji veya özel sağlık hassasiyetiniz var mı?', type: 'textarea',
            placeholder: 'Yoksa “Yok” yazabilirsiniz.', required: true
        },
        {
            key: 'beslenme_aliskanliklari', title: 'Haftalık beslenme alışkanlıklarınızı nasıl tanımlarsınız?', type: 'multi',
            options: ['Düzenli öğünler', 'Dışarıdan sık yemek', 'Atıştırma eğilimi', 'Su tüketimim düşük', 'Özel beslenme uyguluyorum'], required: true
        },
        {
            key: 'hareket_aliskanliklari', title: 'Haftalık hareket alışkanlığınız hangisine daha yakın?', type: 'multi',
            options: ['Hareketsiz', 'Günlük yürüyüş', 'Haftada 1-2 gün', 'Haftada 3-4 gün', 'Haftada 5+ gün'], required: true
        },
        {
            key: 'spor_gecmisi', title: 'Spor geçmişinizi kısaca anlatır mısınız?', type: 'textarea',
            placeholder: 'Daha önce yaptığınız sporlar ve süreleri.', required: true
        },
        {
            key: 'beklentiler', title: 'Zen Wellness Club hizmetinden beklentiniz nedir?', type: 'textarea',
            placeholder: 'Hedefinizi ve önceliğinizi birkaç cümleyle yazın.', required: true
        }
    ];

    const getAssessmentValue = (question) => {
        const answer = state.assessmentAnswers[question.key];
        if (question.type === 'multi') return Array.isArray(answer) ? answer : [];
        return answer ?? '';
    };

    const renderAssessmentQuestion = () => {
        const question = assessmentQuestions[state.assessmentStep];
        if (!question) return;
        const container = document.getElementById('assessment-question');
        const stepLabel = document.getElementById('assessment-step-label');
        const progressValue = document.getElementById('assessment-progress-value');
        const progressBar = document.getElementById('assessment-progress-bar');
        const back = document.getElementById('assessment-back');
        const next = document.getElementById('assessment-next');
        if (!container || !stepLabel || !progressValue || !progressBar || !back || !next) return;

        const progress = Math.round(((state.assessmentStep + 1) / assessmentQuestions.length) * 100);
        stepLabel.textContent = `${state.assessmentStep + 1} / ${assessmentQuestions.length}`;
        progressValue.textContent = `${progress}%`;
        progressBar.style.width = `${progress}%`;
        back.hidden = state.assessmentStep === 0;
        next.textContent = state.assessmentStep === assessmentQuestions.length - 1 ? 'Değerlendirmeyi tamamla' : 'Devam';

        const value = getAssessmentValue(question);
        let control = '';
        if (question.type === 'body') {
            control = `
                <div class="grid" style="grid-template-columns:1fr 1fr; gap:0.65rem; margin-top:1.15rem;">
                    <label>Boy (cm)<input id="assessment-height" type="number" min="80" max="250" step="0.1" value="${escapePortalText(value.height)}" required></label>
                    <label>Kilo (kg)<input id="assessment-weight" type="number" min="20" max="400" step="0.1" value="${escapePortalText(value.weight)}" required></label>
                </div>`;
        } else if (question.type === 'radio' || question.type === 'multi') {
            const selected = question.type === 'radio' ? [value] : value;
            control = `<div class="assessment-option-grid">${question.options.map(option => `
                <label class="assessment-option">
                    <input type="${question.type === 'radio' ? 'radio' : 'checkbox'}"
                        name="assessment-option" value="${escapePortalText(option)}"
                        ${selected.includes(option) ? 'checked' : ''}>
                    <span>${escapePortalText(option)}</span>
                </label>`).join('')}</div>`;
        } else if (question.type === 'textarea') {
            control = `<textarea id="assessment-answer" rows="5" placeholder="${escapePortalText(question.placeholder)}" required>${escapePortalText(value)}</textarea>`;
        } else {
            control = `<input id="assessment-answer" type="${question.type}" value="${escapePortalText(value)}" placeholder="${escapePortalText(question.label)}" ${question.required ? 'required' : ''}>`;
        }
        container.innerHTML = `
            <div class="member-assessment-question">
                <h2>${escapePortalText(question.title)}</h2>
                <p>Bu bilgiler yalnızca size uygun bir wellness planı oluşturmak için kullanılır.</p>
                ${control}
            </div>`;
        document.getElementById('assessment-error').textContent = '';
        container.querySelector('input, textarea')?.focus();
    };

    const captureAssessmentAnswer = () => {
        const question = assessmentQuestions[state.assessmentStep];
        if (question.type === 'body') {
            const height = parseFloat(document.getElementById('assessment-height')?.value);
            const weight = parseFloat(document.getElementById('assessment-weight')?.value);
            if (!height || !weight) return false;
            state.assessmentAnswers[question.key] = { height, weight };
            return true;
        }
        if (question.type === 'radio' || question.type === 'multi') {
            const values = [...document.querySelectorAll('input[name="assessment-option"]:checked')].map(input => input.value);
            if (!values.length) return false;
            state.assessmentAnswers[question.key] = question.type === 'radio' ? values[0] : values;
            return true;
        }
        const input = document.getElementById('assessment-answer');
        const value = input?.value.trim();
        if (!value) return false;
        state.assessmentAnswers[question.key] = value;
        return true;
    };

    window.showMemberAssessment = (member) => {
        state.assessmentMember = member;
        state.assessmentStep = 0;
        state.assessmentAnswers = {
            ad_soyad: member.ad_soyad || '',
            cinsiyet: member.cinsiyet === 'Belirtilmedi' ? '' : member.cinsiyet || '',
            boy: member.boy ? { height: member.boy, weight: '' } : {}
        };
        document.getElementById('member-assessment')?.removeAttribute('hidden');
        document.getElementById('member-assessment')?.setAttribute('aria-hidden', 'false');
        renderAssessmentQuestion();
    };

    window.previousAssessmentQuestion = () => {
        if (state.assessmentStep === 0) return;
        captureAssessmentAnswer();
        state.assessmentStep -= 1;
        renderAssessmentQuestion();
    };

    window.nextAssessmentQuestion = async () => {
        const error = document.getElementById('assessment-error');
        if (!captureAssessmentAnswer()) {
            if (error) error.textContent = 'Lütfen bu soruyu yanıtlayın.';
            return;
        }
        if (state.assessmentStep < assessmentQuestions.length - 1) {
            state.assessmentStep += 1;
            renderAssessmentQuestion();
            return;
        }

        const member = state.assessmentMember;
        const answers = state.assessmentAnswers;
        const birthDate = new Date(`${answers.dogum_tarihi}T00:00:00`);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        if (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())) age -= 1;
        const completedAt = new Date().toISOString();
        const memberUpdate = {
            ad_soyad: answers.ad_soyad,
            telefon: answers.telefon,
            dogum_tarihi: answers.dogum_tarihi,
            cinsiyet: answers.cinsiyet,
            boy: answers.boy.height,
            saglik_gecmisi: answers.saglik_gecmisi,
            alerjiler: answers.alerjiler,
            beslenme_aliskanliklari: answers.beslenme_aliskanliklari.join(', '),
            hareket_aliskanliklari: answers.hareket_aliskanliklari.join(', '),
            spor_gecmisi: answers.spor_gecmisi,
            beklentiler: answers.beklentiler,
            degerlendirme_verileri: answers,
            degerlendirme_tamamlandi: true,
            degerlendirme_tarihi: completedAt
        };
        const measurement = {
            id: Date.now(),
            member_id: member.id,
            tarih: completedAt.slice(0, 10),
            weight: answers.boy.weight,
            l_leg: age
        };
        const [memberResult, measurementResult] = await Promise.all([
            dataService.mutate('uyeler', 'update', memberUpdate, {
                id: member.id,
                expectedUpdatedAt: member.updated_at
            }),
            dataService.mutate('olcumler', 'upsert', measurement)
        ]);
        if (memberResult.error || measurementResult.error) {
            handleError(memberResult.error || measurementResult.error, 'Member assessment save');
            if (error) error.textContent = 'Bilgiler kaydedilemedi. Lütfen tekrar deneyin.';
            return;
        }
        Object.assign(member, memberUpdate);
        document.getElementById('member-assessment')?.setAttribute('hidden', '');
        document.getElementById('member-assessment')?.setAttribute('aria-hidden', 'true');
        await loadMemberPortal();
    };

    async function loadMemberPortal() {
        const status = document.getElementById('member-portal-status');
        if (status) status.textContent = 'Veriler yükleniyor...';
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session) throw new Error('Oturum bulunamadı.');
            const userId = sessionData.session.user.id;
            // Önce sadece member'i çekip ID'sini bulmalıyız
            const memberResult = await supabase.from('uyeler').select('*').eq('auth_user_id', userId).maybeSingle();
            if (memberResult.error) throw memberResult.error;
            const member = memberResult.data;
            if (!member) throw new Error('Bu kullanıcı henüz aktif bir danışan profiline bağlanmamış. Lütfen antrenörünüzden sizi sisteme dahil etmesini isteyin.');

            // Sonra o member'in ID'siyle güvenli bir şekilde filtreleyerek sadece ONUN verilerini çek
            const [measurementsResult, workoutsResult, dietsResult, documentsResult, schedulesResult, pushResult, deliveriesResult, notificationsResult, attendanceResult, completionsResult, healthMetricsResult, workoutSessionsResult] = await Promise.all([
                supabase.from('olcumler').select('*').eq('member_id', member.id),
                supabase.from('antrenmanlar').select('*').eq('member_id', member.id),
                supabase.from('beslenme_planlari').select('*').eq('member_id', member.id),
                supabase.from('dokumanlar').select('*').eq('member_id', member.id),
                supabase.from('weekly_program_schedule').select('*').eq('member_id', member.id),
                supabase.from('push_subscriptions').select('id,endpoint').eq('member_id', member.id),
                supabase.from('push_reminder_deliveries').select('id,subscription_id,schedule_id,reminder_type,delivered_at').order('delivered_at', { ascending: false }).limit(50),
                supabase.from('schedule_notifications').select('id,schedule_id,action,message,created_at,read_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(50),
                supabase.from('schedule_attendance').select('id,schedule_id,occurrence_date,status').eq('member_id', member.id),
                supabase.from('workout_completions').select('id,workout_id,exercise_index,completion_date,completed').eq('member_id', member.id),
                supabase.from('health_metrics').select('*').eq('member_id', member.id),
                supabase.from('workout_sessions').select('*').eq('member_id', member.id)
            ]);
            const result = [measurementsResult, workoutsResult, dietsResult, documentsResult, schedulesResult, pushResult, deliveriesResult]
                .find(item => item.error);
            if (result?.error) throw result.error;
            state.members = [member];
            state.measurements = measurementsResult.data || [];
            state.workouts = workoutsResult.data || [];
            state.schedules = schedulesResult.data || [];
            state.healthMetrics = healthMetricsResult.error ? [] : (healthMetricsResult.data || []);
            state.workoutSessions = workoutSessionsResult.error ? [] : (workoutSessionsResult.data || []);

            // Measurements'ları render etmeden önce hesaplanmış (sanal) alanlarını (BMR, VO2Max vb.) geri getir (Admin panelindeki sync mantığıyla aynı)
            const mappedMeasurements = (measurementsResult.data || []).map(m => {
                m.yas = m.l_leg;
                m.rhr = m.r_leg;
                m.cooper = m.hips;
                if (m.yas) {
                    m.mhr = Math.round(208 - (0.7 * m.yas));
                    if (m.rhr) m.hrr = m.mhr - m.rhr;
                }
                if (m.cooper) {
                    const gender = member.cinsiyet || 'Erkek';
                    if (gender === 'Kadın') {
                        m.vo2max = (65.81 - (0.1847 * m.cooper)).toFixed(1);
                    } else {
                        m.vo2max = (111.33 - (0.42 * m.cooper)).toFixed(1);
                    }
                }
                if (m.weight && m.yas && member.boy) {
                    const gender = member.cinsiyet || 'Erkek';
                    let bmr = (gender === 'Kadın')
                        ? (10 * m.weight) + (6.25 * member.boy) - (5 * m.yas) - 161
                        : (10 * m.weight) + (6.25 * member.boy) - (5 * m.yas) + 5;
                    m.bmr = Math.round(bmr);
                }
                return m;
            });

            renderMemberPortal({
                member,
                measurements: mappedMeasurements,
                workouts: workoutsResult.data || [],
                diets: dietsResult.data || [],
                documents: documentsResult.data || [],
                schedules: schedulesResult.data || [],
                deliveries: deliveriesResult.data || [],
                notifications: notificationsResult.error ? [] : (notificationsResult.data || []),
                attendance: attendanceResult.error ? [] : (attendanceResult.data || []),
                completions: completionsResult.error ? [] : (completionsResult.data || []),
                pushEnabled: (pushResult.data || []).length > 0
            });
            if (!member.degerlendirme_tamamlandi) window.showMemberAssessment(member);
            if (status) status.textContent = 'Salt okunur danışan paneli';
        } catch (error) {
            handleError(error, 'Member portal load');
            if (status) status.textContent = `Panel yüklenemedi: ${error.message}`;
        }
    }

    let workoutTimer = null;
    let seconds = 0;
    let chartObj = null;
    let realtimeChannel = null;
    let realtimeSyncTimer = null;
    let realtimeReconnectTimer = null;

    const REALTIME_TABLES = [
        'uyeler',
        'programlar',
        'olcumler',
        'antrenmanlar',
        'dokumanlar',
        'weekly_program_schedule',
        'master_egzersizler',
        'master_besinler',
        'beslenme_planlari',
        'device_connections',
        'health_metrics',
        'workout_sessions'
    ];

    const MEASUREMENT_FIELDS = [
        { key: 'weight', label: 'Kilo', unit: 'kg', direction: 'down-good' },
        { key: 'fat', label: 'Yağ Oranı', unit: '%', direction: 'down-good' },
        { key: 'neck', label: 'Boyun', unit: 'cm', direction: 'down-good' },
        { key: 'chest', label: 'Göğüs', unit: 'cm', direction: 'up-good' },
        { key: 'waist', label: 'Bel', unit: 'cm', direction: 'down-good' },
        { key: 'basen', label: 'Basen', unit: 'cm', direction: 'down-good' },
        { key: 'sol_onkol', label: 'Sol Önkol', unit: 'cm', direction: 'up-good' },
        { key: 'sag_onkol', label: 'Sağ Önkol', unit: 'cm', direction: 'up-good' },
        { key: 'l_arm', label: 'Sol Kol', unit: 'cm', direction: 'up-good' },
        { key: 'r_arm', label: 'Sağ Kol', unit: 'cm', direction: 'up-good' },
        { key: 'l_bacak', label: 'Sol Üst Bacak', unit: 'cm', direction: 'up-good' },
        { key: 'r_bacak', label: 'Sağ Üst Bacak', unit: 'cm', direction: 'up-good' },
        { key: 'l_kalf', label: 'Sol Kalf', unit: 'cm', direction: 'up-good' },
        { key: 'r_kalf', label: 'Sağ Kalf', unit: 'cm', direction: 'up-good' },
        { key: 'yas', label: 'Yaş', unit: 'yıl', direction: 'neutral' },
        { key: 'rhr', label: 'Dinlenik Nabız (RHR)', unit: 'bpm', direction: 'down-good' },
        { key: 'mhr', label: 'Maksimum Nabız (MHR)', unit: 'bpm', direction: 'neutral' },
        { key: 'hrr', label: 'Nabız Rezervi (HRR)', unit: 'bpm', direction: 'up-good' },
        { key: 'cooper', label: 'Test Sonu Nabız', unit: 'bpm', direction: 'down-good' },
        { key: 'vo2max', label: 'VO2 Max', unit: 'ml/kg/min', direction: 'up-good' },
        { key: 'bmr', label: 'Bazal Metabolizma (BMR)', unit: 'kcal', direction: 'neutral' }
    ];

    const getMeasurementDelta = (current, previous, key) => {
        const currentValue = parseFloat(current?.[key]);
        const previousValue = parseFloat(previous?.[key]);
        if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null;
        return Number((currentValue - previousValue).toFixed(1));
    };

    const getDeltaClass = (delta, direction) => {
        if (delta === null || delta === 0) return 'delta-neutral';
        if (direction === 'neutral') return 'delta-neutral';
        const isPositive = direction === 'up-good' ? delta > 0 : delta < 0;
        return isPositive ? 'delta-positive' : 'delta-negative';
    };

    const formatDelta = (delta, unit = '') => {
        if (delta === null) return 'İlk ölçüm';
        if (delta === 0) return `= 0${unit}`;
        return `${delta > 0 ? '+' : ''}${delta}${unit}`;
    };

    const handleError = (err, context) => {
        console.error(`[${context}] Error:`, err);
    };

    const setSyncStatus = (status, message) => {
        const element = document.getElementById('sync-status');
        if (!element) return;
        element.textContent = message;
        element.dataset.status = status;
    };
    setSyncStatus('offline', 'Yönetici girişi bekleniyor');

    // --- CRITICAL DATA SAFETY HELPER ---
    window.safeJSONParse = (data, fallback = null) => {
        if (!data) return fallback;
        if (typeof data !== 'string') return data;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.warn("JSON Parse Error on data:", data, e);
            return fallback;
        }
    };

    // --- GLOBAL MODAL & ACCORDION HELPERS ---

    window.openModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'block';
        el.setAttribute('aria-hidden', 'false');
    };

    window.closeModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
        if (id === 'modal-new-exercise') {
            document.getElementById('edit-ex-id').value = '';
            document.getElementById('new-ex-name').value = '';
            document.getElementById('group-body-part').value = '';
            document.getElementById('group-muscles-container').style.display = 'none';
            document.getElementById('ex-modal-title').innerText = 'Egzersiz Yönetimi';
        }
        if (id === 'modal-new-food') {
            document.getElementById('edit-f-id').value = '';
            document.getElementById('new-f-name').value = '';
            document.getElementById('new-f-portion').value = '';
            document.getElementById('new-f-cal').value = '';
            document.getElementById('new-f-pro').value = '';
            document.getElementById('new-f-carb').value = '';
            document.getElementById('new-f-fat').value = '';
            document.getElementById('f-modal-title').innerText = 'Besin Yönetimi';
        }
    };

    window.toggleAcc = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const isOpen = el.style.display === 'block';
        el.style.display = isOpen ? 'none' : 'block';
        el.parentElement.classList.toggle('active');
    };

    window.toggleSearchFilters = () => {
        const dropdown = document.getElementById('search-filters-dropdown');
        if (dropdown) dropdown.classList.toggle('active');
    };

    // --- TIME MACHINE (UNDO) LOGIC ---

    window.pushToUndoLog = (actionType, tableName, oldData, newData, description) => {
        if (!state.undoStack) state.undoStack = [];
        state.undoStack.unshift({
            id: Date.now(),
            type: actionType,
            table: tableName,
            oldData: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
            newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
            desc: description,
            time: new Date().toLocaleTimeString('tr-TR')
        });
        if (state.undoStack.length > 20) state.undoStack.pop();

    };

    window.globalUndo = () => {
        window.renderUndoLog();
        window.openModal('modal-undo-log');
    };

    window.renderUndoLog = () => {
        const container = document.getElementById('undo-log-list');
        if (!container) return;
        if (!state.undoStack || state.undoStack.length === 0) {
            container.innerHTML = '<div class="no-results">İşlem geçmişi boş.</div>';
            return;
        }
        container.innerHTML = state.undoStack.map((item, index) => `
            <div class="card mt-1" onclick="window.revertTo(${index})" style="cursor:pointer; border-left: 4px solid var(--primary); padding: 1rem;">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${escapeHtml(item.desc)}</strong>
                    <small style="color:var(--primary);">${escapeHtml(item.time)}</small>
                </div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-top:0.3rem;">Tablo: ${escapeHtml(item.table)} | Tip: ${escapeHtml(item.type)}</p>
                <div style="font-size:0.7rem; color:var(--accent); margin-top:0.5rem; text-align:right;">Bu adıma geri dönmek için dokunun ↩</div>
            </div>
        `).join('');
    };

    window.revertTo = async (index) => {
        if (!confirm("Seçilen işleme kadar olan tüm değişiklikler geri alınacak. Emin misiniz?")) return;
        window.closeModal('modal-undo-log');

        // Hızlıca UI'ı dondur veya loading göster
        const fab = document.querySelector('.fab');
        if(fab) fab.innerHTML = '⏳';

        try {
            const actions = state.undoStack.slice(0, index + 1);

            for (const action of actions) {
                // INSERT edilen veriyi veritabanından SIL (Geri al)
                if (action.type === 'INSERT') {
                    if (action.newData && action.newData.id) {
                        await supabase.from(action.table).delete().eq('id', action.newData.id);
                    }
                }
                // DELETE edilen veriyi veritabanına TEKRAR EKLE (Geri al)
                else if (action.type === 'DELETE') {
                    if (action.oldData) {
                        await supabase.from(action.table).insert(action.oldData);
                    }
                }
                // UPDATE edilen veriyi ESKİ HALİNE UPSERT ET (Geri al)
                else if (action.type === 'UPDATE') {
                    if (action.oldData) {
                        await supabase.from(action.table).upsert(action.oldData);
                    }
                }
            }

            // İşlemler başarılı olduysa, undo logdan o ve önceki adımları temizle
            state.undoStack.splice(0, index + 1);

            // Verileri Supabase'den tekrar çek (senkronize et) ve UI'ı güncelle
            await sync();
            alert("İşlemler başarıyla geri alındı!");
        } catch (err) {
            console.error("Geri Alma Hatası (RevertTo):", err);
            alert("Geri alma işlemi sırasında bir hata oluştu! Konsolu kontrol edin.");
        } finally {
            if(fab) fab.innerHTML = '➕';
        }
    };

    // --- NAVIGATION ---

    window.nav = (id, saveHistory = true) => {
        if (typeof window.toggleMobileMenu === 'function') window.toggleMobileMenu(false);
        if (saveHistory) {
            const currentTop = state.navHistory[state.navHistory.length - 1];
            if (currentTop !== id) state.navHistory.push(id);
        }
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');
        refreshAll();
    };

    window.toggleMobileMenu = (forceOpen) => {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.drawer-overlay');
        const toggle = document.querySelector('.mobile-logo');
        if (!sidebar || !overlay) return;
        const shouldOpen = typeof forceOpen === 'boolean'
            ? forceOpen
            : !sidebar.classList.contains('mobile-open');
        sidebar.classList.toggle('mobile-open', shouldOpen);
        overlay.classList.toggle('active', shouldOpen);
        if (toggle) toggle.setAttribute('aria-expanded', String(shouldOpen));
    };

    window.goBack = () => {
        if (state.navHistory.length > 1) {
            state.navHistory.pop();
            window.nav(state.navHistory[state.navHistory.length - 1], false);
        } else {
            window.nav('members-view', false);
        }
    };

    window.tab = (id) => {
        if (state.measurementRequired && id !== 'measurements') {
            alert("⚠️ Bu ay için ölçüm zorunludur! Lütfen önce ölçüm kaydedin.");
            return;
        }
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
            c.style.display = 'none';
        });
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

        const targetTab = document.getElementById(`tab-${id}`);
        const targetBtn = document.getElementById(`btn-tab-${id}`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'block';
        }
        if (targetBtn) targetBtn.classList.add('active');
        if(id === 'analytics') window.loadMetricList();
        refreshAll();
    };

    // --- TIMER ---

    window.toggleWorkoutTimer = () => {
        const btn = document.getElementById('btn-timer-toggle');
        if (workoutTimer) {
            clearInterval(workoutTimer);
            workoutTimer = null;
            btn.innerText = '▶ Devam Et';
            btn.style.background = 'var(--accent)';
        } else {
            workoutTimer = setInterval(() => {
                seconds++;
                const hrs = Math.floor(seconds / 3600);
                const mins = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                document.getElementById('timer-val').innerText =
                    `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
            btn.innerText = '⏸ Durdur';
            btn.style.background = 'var(--danger)';
        }
    };

    window.resetWorkoutTimer = () => {
        clearInterval(workoutTimer); workoutTimer = null; seconds = 0;
        document.getElementById('timer-val').innerText = '00:00:00';
        const btn = document.getElementById('btn-timer-toggle');
        if (btn) btn.innerText = '▶ Antrenmanı Başlat';
    };

    window.stepValue = (id, amount) => {
        const input = document.getElementById(id);
        if (!input) return;
        let val = (parseFloat(input.value) || 0) + amount;
        input.value = val < 0 ? 0 : val.toFixed(1);
    };

    // --- DASHBOARD & ANALYTICS ---


    window.generateMemberReport = async () => {
        if (!state.activeMemberId) return;

        const member = state.members.find(m => m.id == state.activeMemberId);
        if (!member) return;

        // Fetch data
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));
        const myW = state.workouts.filter(w => w.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));
        const myD = state.diets.filter(d => d.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));

        // Get actual physical measurements
        const physicalM = myM.filter(m => m.weight);
        const lastM = physicalM.length > 0 ? physicalM[0] : null;

        // Get cardio tests
        const cardioM = myM.filter(m => m.vo2max || m.rhr || m.bmr);
        const lastC = cardioM.length > 0 ? cardioM[0] : null;

        // Get latest diet
        const lastDiet = myD.length > 0 ? myD[0] : null;

        let report = `*${member.ad_soyad.toUpperCase()} - GELİŞİM RAPORU* 📊\n`;
        report += `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n`;
        report += `Branş: ${member.brans}\n\n`;

        if (lastM) {
            report += `*📏 SON VÜCUT ÖLÇÜMLERİ (${new Date(lastM.tarih).toLocaleDateString('tr-TR')})*\n`;
            if(lastM.weight) report += `• Kilo: ${lastM.weight} kg\n`;
            if(lastM.fat) report += `• Yağ Oranı: %${lastM.fat}\n`;
            if(lastM.waist) report += `• Bel: ${lastM.waist} cm\n`;
            if(lastM.chest) report += `• Göğüs: ${lastM.chest} cm\n`;
            report += `\n`;
        }

        if (lastC) {
            report += `*🫀 KARDİYO & METABOLİZMA (${new Date(lastC.tarih).toLocaleDateString('tr-TR')})*\n`;
            if(lastC.bmr) report += `• Bazal Metabolizma (BMR): ${lastC.bmr} kcal\n`;
            if(lastC.vo2max) report += `• VO2 Max: ${lastC.vo2max}\n`;
            if(lastC.rhr) report += `• Dinlenik Nabız (RHR): ${lastC.rhr} bpm\n`;
            if(lastC.hrr) report += `• Nabız Rezervi (HRR): ${lastC.hrr} bpm\n`;
            report += `\n`;
        }

        if (lastDiet) {
            const meals = window.safeJSONParse(lastDiet.ogunler, []);
            let tCal = 0, tPro = 0, tCarb = 0, tFat = 0;
            meals.forEach(m => {
                tCal += m.kalori || 0; tPro += m.protein || 0; tCarb += m.karbonhidrat || 0; tFat += m.yag || 0;
            });
            report += `*🍏 AKTİF BESLENME PLANI (${lastDiet.plan_adi})*\n`;
            report += `• ${tCal.toFixed(0)} kcal\n`;
            report += `• Protein: ${tPro.toFixed(0)}g | Karb: ${tCarb.toFixed(0)}g | Yağ: ${tFat.toFixed(0)}g\n`;
            report += `\n`;
        }

        if (myW.length > 0) {
            report += `*🏋️ ANTRENMAN ÖZETİ*\n`;
            report += `• Toplam tamamlanan antrenman: ${myW.length}\n`;
            report += `• Son antrenman tarihi: ${new Date(myW[0].tarih).toLocaleDateString('tr-TR')}\n`;
        }

        report += `\n_Zen Wellness Club tarafından Trainer Pro ile oluşturulmuştur._`;

        try {
            await navigator.clipboard.writeText(report);
            alert("Rapor başarıyla panoya kopyalandı! (WhatsApp veya Mail'e yapıştırabilirsiniz)");
        } catch (err) {
            console.error("Panoya kopyalanamadı:", err);
            prompt("Panoya otomatik kopyalama başarısız oldu. Aşağıdaki metni kopyalayabilirsiniz:", report);
        }
    };

    window.updateDashboardSummary = () => {
        if (!state.activeMemberId) return;
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));
        const myW = state.workouts.filter(w => w.member_id == state.activeMemberId);
        const myD = state.diets.filter(d => d.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));

        document.getElementById('stat-weight').innerText = myM.length > 0 && myM[0].weight != null ? `${myM[0].weight} kg` : '--';
        document.getElementById('stat-fat').innerText = myM.length > 0 && myM[0].fat != null ? `%${myM[0].fat}` : '--';
        document.getElementById('stat-workouts').innerText = myW.length;

        if (myD.length > 0) {
            const lastDiet = myD[0];
            const meals = window.safeJSONParse(lastDiet.ogunler, []);
            let tCal = 0;
            meals.forEach(m => tCal += m.kalori || 0);
            document.getElementById('stat-cals').innerText = `${tCal.toFixed(0)} kcal`;
        } else {
            document.getElementById('stat-cals').innerText = '--';
        }

        window.updateChart();
    };

    window.loadMetricList = () => {
        const cat = document.getElementById('chart-cat').value;
        const sub = document.getElementById('chart-sub-cat');
        if (!sub) return;
        sub.innerHTML = '<option value="">Seçin...</option>';
        if(cat === 'olcum' || cat === 'testler') {
            const bodyMeasurementKeys = new Set([
                'weight', 'fat', 'neck', 'chest', 'waist', 'basen',
                'sol_onkol', 'sag_onkol', 'l_arm', 'r_arm',
                'l_bacak', 'r_bacak', 'l_kalf', 'r_kalf'
            ]);
            const bodyMeasurements = MEASUREMENT_FIELDS.filter(field => bodyMeasurementKeys.has(field.key));
            const testMeasurements = MEASUREMENT_FIELDS.filter(field => !bodyMeasurementKeys.has(field.key));

            if (cat === 'olcum') {
                sub.innerHTML += `<optgroup label="Vücut Ölçümleri">
                    ${bodyMeasurements.map(field => `<option value="${field.key}">${field.label}</option>`).join('')}
                </optgroup>`;
                sub.innerHTML += `<optgroup label="Test Değerleri">
                    ${testMeasurements.map(field => `<option value="${field.key}">${field.label}</option>`).join('')}
                </optgroup>`;
            } else {
                sub.innerHTML += `<optgroup label="Test Değerleri">
                    ${testMeasurements.map(field => `<option value="${field.key}">${field.label}</option>`).join('')}
                </optgroup>`;
            }
        } else if (cat === 'beslenme') {
            [['kalori', 'Toplam Kalori'], ['protein', 'Protein (g)'], ['karbonhidrat', 'Karbonhidrat (g)'], ['yag', 'Yağ (g)']].forEach(m => {
                sub.innerHTML += `<option value="${m[0]}">${m[1]}</option>`;
            });
        } else {
            const myW = state.workouts.filter(w => w.member_id == state.activeMemberId);
            const exercises = [...new Set(myW.flatMap(w => {
                const sets = window.safeJSONParse(w.setler, []);
                return sets.map(s => s.ad);
            }))];
            exercises.forEach(ex => sub.innerHTML += `<option value="${ex}">${ex}</option>`);
        }
    };

    window.updateChart = () => {
        const cat = document.getElementById('chart-cat').value;
        const metric = document.getElementById('chart-sub-cat').value;
        const chartCanvas = document.getElementById('mainChart');
        const description = document.getElementById('chart-description');
        if (!chartCanvas || !metric) {
            if (description) description.innerText = 'Bir parametre seçerek değişimi inceleyin.';
            return;
        }

        const ctx = chartCanvas.getContext('2d');
        let labels = [], data = [], chartDeltas = [];

        if(cat === 'olcum' || cat === 'testler') {
            const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b)=>new Date(a.tarih)-new Date(b.tarih));
            labels = myM.map(m => new Date(m.tarih).toLocaleDateString('tr-TR'));
            data = myM.map(m => {
                const value = parseFloat(m[metric]);
                return Number.isFinite(value) ? value : null;
            });
            chartDeltas = myM.map((m, index) => {
                const previous = index > 0 ? myM[index - 1] : null;
                return getMeasurementDelta(m, previous, metric);
            });
        } else if (cat === 'beslenme') {
            const myD = state.diets.filter(d => d.member_id == state.activeMemberId).sort((a,b)=>new Date(a.tarih)-new Date(b.tarih));
            myD.forEach(d => {
                const meals = window.safeJSONParse(d.ogunler, []);
                let total = 0;
                meals.forEach(m => total += m[metric] || 0);
                labels.push(new Date(d.tarih).toLocaleDateString('tr-TR'));
                data.push(total);
            });
        } else {
            const myW = state.workouts.filter(w => w.member_id == state.activeMemberId).sort((a,b)=>new Date(a.tarih)-new Date(b.tarih));
            myW.forEach(w => {
                const sets = window.safeJSONParse(w.setler, []);
                const s = sets.find(s => s.ad === metric);
                if(s) { labels.push(new Date(w.tarih).toLocaleDateString('tr-TR')); data.push(parseFloat(s.weight) || 0); }
            });
        }

        if (chartObj) chartObj.destroy();
        const measurementField = MEASUREMENT_FIELDS.find(field => field.key === metric);
        const chartUnit = measurementField?.unit || '';
        const chartLabel = measurementField?.label || metric.toUpperCase();
        const validPoints = data.filter(value => Number.isFinite(value)).length;
        const latestDelta = chartDeltas.length ? chartDeltas[chartDeltas.length - 1] : null;
        if (description) {
            description.innerText = validPoints === 0
                ? `${chartLabel} için henüz veri bulunmuyor.`
                : `${validPoints} kayıt · ${latestDelta === null ? 'İlk kayıt' : `Son değişim: ${formatDelta(latestDelta, chartUnit)}`}`;
        }
        const pointColors = chartDeltas.map(delta => {
            if (delta === null || delta === 0) return '#e4ba94';
            return delta > 0 ? '#35d07f' : '#ff5b67';
        });

        chartObj = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: chartLabel, data, borderColor: '#e4ba94', pointBackgroundColor: pointColors, pointBorderColor: '#050505', pointRadius: 4, tension: 0.4, fill: true, backgroundColor: 'rgba(228, 186, 148, 0.12)' }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#b7a69a' }, grid: { color: 'rgba(228, 186, 148, 0.08)' } },
                    y: { ticks: { color: '#b7a69a' }, grid: { color: 'rgba(228, 186, 148, 0.08)' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                const valueText = Number.isFinite(value) ? `${value}${chartUnit}` : '--';
                                if (cat !== 'olcum' && cat !== 'testler') return `${chartLabel}: ${valueText}`;
                                const delta = chartDeltas[context.dataIndex];
                                return [
                                    `${chartLabel}: ${valueText}`,
                                    `Değişim: ${formatDelta(delta, chartUnit)}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    };

    window.getLastPerformance = (exName) => {
        if (!state.activeMemberId) return null;
        const myW = state.workouts
            .filter(w => w.member_id == state.activeMemberId)
            .sort((a,b) => new Date(b.tarih) - new Date(a.tarih)); // FIX: sort descending logic via b-a date parse

        for (const w of myW) {
            const setler = window.safeJSONParse(w.setler, []);
            const set = setler.find(s => s.ad === exName);
            if (set) return { weight: set.weight, reps: set.reps, date: w.tarih };
        }
        return null;
    };

    window.updatePerfHint = (selectEl) => {
        const exName = selectEl.value;
        const hintDiv = selectEl.parentElement.nextElementSibling;
        const last = window.getLastPerformance(exName);
        if (last) {
            hintDiv.style.display = 'block';
            hintDiv.innerHTML = `💡 Son Performans: <b>${last.weight}kg x ${last.reps}</b> (${new Date(last.date).toLocaleDateString('tr-TR')})`;
        } else {
            hintDiv.style.display = 'none';
        }
    };

    // --- RENDERING ---

    window.renderFoods = () => {
        const container = document.getElementById('foods-grid');
        if (!container) return;

        const filterDropdown = document.getElementById('filter-food-type');
        const filterType = filterDropdown?.value || '';

        function getAnaGrup(tip) {
            if (!tip) return 'Yiyecekler';
            if (tip.includes('İçecek')) return 'İçecekler';
            const supTypes = ['💪 Protein Tozları', '🔋 Karbonhidratlar', '🧬 Amino Asitler', '⚡ Performans & Enerji', '🔥 Yağ Yakıcılar', '💊 Vitaminler', '🪨 Mineraller', '🌿 Sağlık & Wellness'];
            if (supTypes.includes(tip) || tip.includes('Supplement')) return 'Supplementler';
            return 'Yiyecekler';
        }

        const superGroups = {
            'Yiyecekler': {},
            'İçecekler': {},
            'Supplementler': {}
        };

        // Dynamically build available types
        const availableTypes = [...new Set(state.foods.map(f => f.tip || 'Yemek'))].sort();
        if (filterDropdown && filterDropdown.options.length <= 4) { // Initialize dropdown if not yet built dynamically
            const currVal = filterDropdown.value;
            filterDropdown.innerHTML = '<option value="">Tüm Tipler</option>' + availableTypes.map(t => `<option value="${t}">${t}</option>`).join('');
            filterDropdown.value = currVal;
        }

        state.foods.forEach(f => {
            if (filterType && f.tip !== filterType) return;
            const t = f.tip || 'Yemek';
            const ana = getAnaGrup(t);
            if (!superGroups[ana][t]) superGroups[ana][t] = [];
            superGroups[ana][t].push(f);
        });

        let html = '';

        Object.keys(superGroups).forEach(ana => {
            const altGruplar = superGroups[ana];
            const altGrupIsimleri = Object.keys(altGruplar).sort();
            if (altGrupIsimleri.length === 0) return;

            let anaIcon = ana === 'Yiyecekler' ? '🍽️' : (ana === 'İçecekler' ? '🥤' : '💊');
            html += `<h2 style="margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--primary); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">${anaIcon} ${ana}</h2>`;

            altGrupIsimleri.forEach(alt => {
                const list = altGruplar[alt];
                if (list.length === 0) return;

                const displayList = list.slice(0, 100);
                const hiddenCount = list.length - displayList.length;
                const hiddenNote = hiddenCount > 0 ? `<div style="text-align:center; padding:1rem; color:var(--text-dim); font-size:0.8rem;">+ ${hiddenCount} besin daha var. Bulmak için Arama Çubuğunu kullanın.</div>` : '';

                html += `
                    <div class="accordion mt-1">
                        <div class="acc-header" onclick="window.toggleAcc('food-group-${alt.replace(/[^a-zA-Z0-9]/g, '')}')" style="background: rgba(255,255,255,0.03);">
                            <h3 style="font-size: 0.95rem;">${escapeHtml(alt)} (${list.length})</h3>
                            <span>▼</span>
                        </div>
                        <div id="food-group-${alt.replace(/[^a-zA-Z0-9]/g, '')}" class="acc-body grid">
                            ${displayList.map(f => `
                                <div class="card">
                                    <h3>${escapeHtml(f.ad)}</h3>
                                    <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0.5rem;">${escapeHtml(f.porsiyon)}</p>
                                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:0.5rem; background:rgba(0,0,0,0.2); border-radius:4px;">
                                        <span>🔥 ${f.kalori} kcal</span>
                                        <span>P: ${f.protein}g</span>
                                        <span>C: ${f.karbonhidrat}g</span>
                                        <span>Y: ${f.yag}g</span>
                                    </div>
                                    <div class="card-actions mt-1">
                                        <button class="btn-edit" onclick="window.editFood(${f.id})">✎</button>
                                        <button class="btn-delete" onclick="window.deleteFood(${f.id})">🗑</button>
                                    </div>
                                </div>
                            `).join('')}
                            ${hiddenNote}
                        </div>
                    </div>
                `;
            });
        });

        container.innerHTML = html;

        if (container.innerHTML === '') {
            container.innerHTML = '<div class="no-results mt-1">Kriterlere uygun besin bulunamadı.</div>';
        }
    };

    window.editFood = (id) => {
        const f = state.foods.find(x => x.id == id);
        if (!f) return;
        document.getElementById('edit-f-id').value = f.id;
        document.getElementById('new-f-name').value = f.ad;
        document.getElementById('new-f-type').value = f.tip;
        document.getElementById('new-f-portion').value = f.porsiyon;
        document.getElementById('new-f-cal').value = f.kalori;
        document.getElementById('new-f-pro').value = f.protein;
        document.getElementById('new-f-carb').value = f.karbonhidrat;
        document.getElementById('new-f-fat').value = f.yag;
        document.getElementById('f-modal-title').innerText = 'Besini Düzenle';
        window.openModal('modal-new-food');
    };

    window.saveNewFood = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('edit-f-id').value;
        const id = existingId || Date.now();
        const newData = {
            id,
            ad: document.getElementById('new-f-name').value,
            tip: document.getElementById('new-f-type').value,
            porsiyon: document.getElementById('new-f-portion').value,
            kalori: parseFloat(document.getElementById('new-f-cal').value) || 0,
            protein: parseFloat(document.getElementById('new-f-pro').value) || 0,
            karbonhidrat: parseFloat(document.getElementById('new-f-carb').value) || 0,
            yag: parseFloat(document.getElementById('new-f-fat').value) || 0
        };
        const result = await dataService.mutate('master_besinler', 'upsert', newData);
        if (result.error) throw result.error;
        const oldData = existingId ? state.foods.find(f => f.id == existingId) : null;
        window.pushToUndoLog(existingId ? 'UPDATE' : 'INSERT', 'master_besinler', oldData, newData, `Besin: ${newData.ad}`);
        await sync();
        window.closeModal('modal-new-food');
    };

    window.deleteFood = async (id) => {
        if (confirm("Silinsin mi?")) {
            const oldData = state.foods.find(f => f.id == id);
            const result = await dataService.mutate('master_besinler', 'delete', null, { id });
            if (result.error) throw result.error;
            window.pushToUndoLog('DELETE', 'master_besinler', oldData, null, `Besin Silindi: ${oldData.ad}`);
            await sync();
        }
    };

    window.renderDietHistory = () => {
        const container = document.getElementById('diet-history-tree');
        if (!container) return;
        const myDiets = state.diets.filter(d => d.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myDiets.length === 0) { container.innerHTML = '<div class="no-results mt-1">Beslenme planı bulunamadı.</div>'; return; }
        container.innerHTML = myDiets.map(d => {
            const meals = window.safeJSONParse(d.ogunler, []);
            let tCal = 0, tPro = 0, tCarb = 0, tFat = 0;
            meals.forEach(m => {
                tCal += m.kalori || 0; tPro += m.protein || 0; tCarb += m.karbonhidrat || 0; tFat += m.yag || 0;
            });
            return `
            <div class="card mt-1" onclick="window.showDietDetail(${d.id})" style="cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><div class="workout-meta">${new Date(d.tarih).toLocaleDateString('tr-TR')}</div><h3>${escapeHtml(d.plan_adi)}</h3></div>
                    <div class="card-actions">
                        <button class="btn-edit" onclick="event.stopPropagation(); window.cloneDietPlan(${d.id})" title="Bu planı kopyala">⧉</button>
                        <button class="btn-delete" onclick="event.stopPropagation(); window.deleteDietPlan(${d.id})">🗑</button>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; font-size:0.8rem; margin-top:0.5rem; color:var(--text-dim);">
                    <span>🔥 ${tCal.toFixed(0)} kcal</span>|<span>P: ${tPro.toFixed(0)}g</span>|<span>C: ${tCarb.toFixed(0)}g</span>|<span>Y: ${tFat.toFixed(0)}g</span>
                </div>
            </div>
        `}).join('');
    };


    window.cloneDietPlan = (id) => {
        const d = state.diets.find(x => x.id == id);
        if (!d) return;

        // Open modal
        document.getElementById('d-name').value = `${d.plan_adi} (Kopya)`;
        document.getElementById('meal-rows-container').innerHTML = '';

        // Set to today's date
        const today = new Date();
        const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('d-date').value = dateString;

        // Parse meals and populate
        const meals = window.safeJSONParse(d.ogunler, []);

        // Group meals by meal_name (since the new structure uses nested meals)
        const groupedMeals = {};
        meals.forEach(m => {
            const mName = m.meal_name || "Öğün";
            if (!groupedMeals[mName]) groupedMeals[mName] = [];
            groupedMeals[mName].push(m);
        });

        // Reconstruct the nested UI
        for (const [mName, foods] of Object.entries(groupedMeals)) {
            window.addMealRowToDiet(mName); // Create the meal block

            // The addMealRowToDiet function adds it to the end of the container.
            // Find that newly created container:
            const mealWrappers = document.querySelectorAll('.meal-row-wrapper');
            const newMealWrapper = mealWrappers[mealWrappers.length - 1];
            const foodsContainer = newMealWrapper.querySelector('.foods-container');

            // Clear the default empty row it creates
            foodsContainer.innerHTML = '';

            // Add all foods for this meal
            foods.forEach(f => {
                window.addSingleFoodRow(foodsContainer, f);
            });
        }

        window.updateDietTotals();
        window.openModal('modal-diet');
    };

    window.openDietModal = () => {
        document.getElementById('d-name').value = '';
        document.getElementById('meal-rows-container').innerHTML = '';
        const today = new Date();
        const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('d-date').value = dateString;
        window.updateDietTotals();
        window.openModal('modal-diet');
    };

    // --- YENİ BESLENME SİSTEMİ (ÖĞÜN GRUPLARI & KOPYALAMA) ---

    // 1. Tekil Besin Satırı (Kopyalama Özellikli)
    window.addSingleFoodRow = (container, vals = {}) => {
        const div = document.createElement('div');
        div.className = 'single-food-row';
        div.style.position = 'relative';
        div.style.marginBottom = '0.4rem';
        div.style.paddingBottom = '0.4rem';
        div.style.borderBottom = '1px dashed rgba(255,255,255,0.1)';

        div.innerHTML = `
            <div class="form-group" style="margin-bottom:0.5rem;">
                <div style="position:relative;">
                    <input type="text" class="ex-select m-search w-full" placeholder="Besin Ara (Örn: Tavuk, Yulaf)..." oninput="window.searchFoodForDiet(this)" autocomplete="off" value="${vals.searchName || ''}">
                    <input type="hidden" class="m-name" required value="${vals.foodId || ''}">
                    <div class="m-search-results" style="display:none; position:absolute; top:100%; left:0; width:100%; background:var(--bg); border:1px solid var(--border); border-radius:4px; max-height:200px; overflow-y:auto; z-index:1000; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>
                </div>
            </div>
            <div class="grid" style="grid-template-columns: 2fr 1.5fr 1.5fr 1.5fr 1.5fr 1fr; gap:0.5rem; align-items:end;">
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Miktar</label>
                    <input type="number" step="0.1" class="m-qty w-full" value="${vals.qty || ''}" required oninput="window.updateMealRow(this)" style="padding:0.4rem; border-radius:4px;" ${vals.baseAmount ? `data-base-amount="${vals.baseAmount}" data-base-cal="${vals.baseCal}" data-base-pro="${vals.basePro}" data-base-carb="${vals.baseCarb}" data-base-fat="${vals.baseFat}"` : ''}>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Kcal</label>
                    <input type="number" step="0.1" class="m-cal w-full" value="${vals.cal || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Pro(g)</label>
                    <input type="number" step="0.1" class="m-pro w-full" value="${vals.pro || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Karb(g)</label>
                    <input type="number" step="0.1" class="m-carb w-full" value="${vals.carb || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Yağ(g)</label>
                    <input type="number" step="0.1" class="m-fat w-full" value="${vals.fat || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0; text-align:right; display:flex; justify-content:flex-end; gap:0.4rem;">
                    <button type="button" onclick="window.duplicateFoodRow(this)" style="background:transparent; border:none; color:var(--primary-color, #4CAF50); font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Bu besini kopyala">⧉</button>
                    <button type="button" onclick="this.parentElement.parentElement.parentElement.remove(); window.updateDietTotals();" style="background:transparent; border:none; color:#ff4444; font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Sil">×</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    };

    window.duplicateFoodRow = (btn) => {
        const row = btn.closest('.single-food-row');
        const container = row.parentElement;
        const qtyInput = row.querySelector('.m-qty');

        const vals = {
            searchName: row.querySelector('.m-search').value,
            foodId: row.querySelector('.m-name').value,
            qty: qtyInput.value,
            cal: row.querySelector('.m-cal').value,
            pro: row.querySelector('.m-pro').value,
            carb: row.querySelector('.m-carb').value,
            fat: row.querySelector('.m-fat').value,
            baseAmount: qtyInput.dataset.baseAmount,
            baseCal: qtyInput.dataset.baseCal,
            basePro: qtyInput.dataset.basePro,
            baseCarb: qtyInput.dataset.baseCarb,
            baseFat: qtyInput.dataset.baseFat
        };
        window.addSingleFoodRow(container, vals);
        window.updateDietTotals();
    };

    // 2. Ana Öğün Grubu (Kahvaltı, Öğle vs.)
    window.addMealRowToDiet = () => {
        const container = document.getElementById('meal-rows-container');
        const uniqueId = Date.now() + Math.random();

        const wrapper = document.createElement('div');
        wrapper.className = 'meal-group-wrapper';
        wrapper.style.marginBottom = '1rem';
        wrapper.style.padding = '1rem';
        wrapper.style.background = 'rgba(255,255,255,0.02)';
        wrapper.style.borderRadius = '8px';
        wrapper.style.position = 'relative';

        wrapper.innerHTML = `
            <button type="button" class="btn-delete" onclick="this.parentElement.remove(); window.updateDietTotals();" style="position:absolute; top:5px; right:5px; width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;">×</button>

            <div class="form-group" style="margin-bottom:0.8rem; padding-right: 30px;">
                <label style="display:block; margin-bottom:0.2rem; color:var(--text-dim); font-size:0.8rem;">Öğün Adı</label>
                <select class="m-meal-name w-full" required style="font-weight:bold;">
                    <option value="Kahvaltı">Kahvaltı</option>
                    <option value="Öğle Yemeği">Öğle Yemeği</option>
                    <option value="Akşam Yemeği">Akşam Yemeği</option>
                    <option value="Ara Öğün 1">Ara Öğün 1</option>
                    <option value="Ara Öğün 2">Ara Öğün 2</option>
                    <option value="Antrenman Öncesi">Antrenman Öncesi</option>
                    <option value="Antrenman Sonrası">Antrenman Sonrası</option>
                    <option value="Gece">Gece Öğünü</option>
                </select>
            </div>

            <div class="foods-container" id="foods-${uniqueId}"></div>

            <button type="button" class="btn-secondary mt-1" style="font-size:0.75rem; padding:0.4rem; background:transparent; border:1px dashed var(--border); width:100%; color:var(--text-dim);" onclick="window.addSingleFoodRow(this.previousElementSibling)">
                + Bu Öğüne Besin Ekle
            </button>
        `;

        container.appendChild(wrapper);
        window.addSingleFoodRow(wrapper.querySelector('.foods-container'));
    };

    window.searchFoodForDiet = (inputEl) => {
        const keyword = inputEl.value.toLowerCase();
        const resultsContainer = inputEl.nextElementSibling.nextElementSibling;

        if (keyword.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }
        const matches = state.foods.filter(f => f.ad.toLowerCase().includes(keyword) || (f.tip && f.tip.toLowerCase().includes(keyword))).slice(0, 50);
        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:0.5rem; color:var(--text-dim); font-size:0.8rem;">Sonuç bulunamadı.</div>';
        } else {
            resultsContainer.innerHTML = matches.map(f => `
                <div style="padding:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; font-size:0.8rem;" onclick="window.selectFoodForDiet(this, ${f.id}, ${jsAttr(f.ad)})">
                    <strong>${escapeHtml(f.ad)}</strong><br>
                    <span style="color:var(--text-dim); font-size:0.7rem;">${escapeHtml(f.tip || 'Yemek')} - ${escapeHtml(f.porsiyon)} | 🔥${f.kalori} P:${f.protein} C:${f.karbonhidrat} Y:${f.yag}</span>
                </div>
            `).join('');
        }
        resultsContainer.style.display = 'block';
    };

    window.selectFoodForDiet = (itemEl, id, name) => {
        const wrapper = itemEl.closest('.form-group');
        const inputSearch = wrapper.querySelector('.m-search');
        const inputHidden = wrapper.querySelector('.m-name');
        const resultsContainer = wrapper.querySelector('.m-search-results');

        inputSearch.value = name;
        inputHidden.value = id;
        resultsContainer.style.display = 'none';

        window.fillMealData(inputHidden);
    };

    window.fillMealData = (hiddenInputEl) => {
        const id = hiddenInputEl.value;
        const wrapper = hiddenInputEl.closest('.single-food-row');
        const f = state.foods.find(x => x.id == id);
        const qtyInput = wrapper.querySelector('.m-qty');

        if (f) {
            const match = (f.porsiyon || '').match(/(\d+)\s*(g|ml)/i);
            const baseAmount = match ? parseFloat(match[1]) : 1;

            qtyInput.dataset.baseAmount = baseAmount;
            qtyInput.dataset.baseCal = f.kalori;
            qtyInput.dataset.basePro = f.protein;
            qtyInput.dataset.baseCarb = f.karbonhidrat;
            qtyInput.dataset.baseFat = f.yag;

            qtyInput.value = baseAmount;
            window.updateMealRow(qtyInput);
        } else {
            qtyInput.value = '';
            wrapper.querySelector('.m-cal').value = '';
            wrapper.querySelector('.m-pro').value = '';
            wrapper.querySelector('.m-carb').value = '';
            wrapper.querySelector('.m-fat').value = '';
            window.updateDietTotals();
        }
    };

    window.updateMealRow = (qtyInput) => {
        const wrapper = qtyInput.closest('.single-food-row');
        const val = parseFloat(qtyInput.value) || 0;
        const baseAmount = parseFloat(qtyInput.dataset.baseAmount) || 1;
        const multiplier = baseAmount > 0 ? (val / baseAmount) : 0;

        wrapper.querySelector('.m-cal').value = (parseFloat(qtyInput.dataset.baseCal || 0) * multiplier).toFixed(1);
        wrapper.querySelector('.m-pro').value = (parseFloat(qtyInput.dataset.basePro || 0) * multiplier).toFixed(1);
        wrapper.querySelector('.m-carb').value = (parseFloat(qtyInput.dataset.baseCarb || 0) * multiplier).toFixed(1);
        wrapper.querySelector('.m-fat').value = (parseFloat(qtyInput.dataset.baseFat || 0) * multiplier).toFixed(1);

        window.updateDietTotals();
    };

    window.updateDietTotals = () => {
        let tCal = 0, tPro = 0, tCarb = 0, tFat = 0;
        document.querySelectorAll('.single-food-row').forEach(row => {
            tCal += parseFloat(row.querySelector('.m-cal').value) || 0;
            tPro += parseFloat(row.querySelector('.m-pro').value) || 0;
            tCarb += parseFloat(row.querySelector('.m-carb').value) || 0;
            tFat += parseFloat(row.querySelector('.m-fat').value) || 0;
        });
        const elCal = document.getElementById('diet-total-cals');
        if(elCal) {
            elCal.innerText = tCal.toFixed(1);
            document.getElementById('diet-total-pro').innerText = tPro.toFixed(1);
            document.getElementById('diet-total-carb').innerText = tCarb.toFixed(1);
            document.getElementById('diet-total-fat').innerText = tFat.toFixed(1);
        }
    };

    window.saveDietPlan = async (e) => {
        e.preventDefault();
        const ogunler = [];

        // Ana Öğün Bloklarını Dön
        document.querySelectorAll('.meal-group-wrapper').forEach(mealWrapper => {
            const ogunAdi = mealWrapper.querySelector('.m-meal-name').value;

            // Öğünün içindeki alt besinleri dön
            mealWrapper.querySelectorAll('.single-food-row').forEach(row => {
                const fId = row.querySelector('.m-name').value;
                const f = state.foods.find(x => x.id == fId);
                if (f) {
                    ogunler.push({
                        ogun_adi: ogunAdi,
                        ad: f.ad,
                        porsiyon: f.porsiyon,
                        miktar: parseFloat(row.querySelector('.m-qty').value) || 0,
                        kalori: parseFloat(row.querySelector('.m-cal').value) || 0,
                        protein: parseFloat(row.querySelector('.m-pro').value) || 0,
                        karbonhidrat: parseFloat(row.querySelector('.m-carb').value) || 0,
                        yag: parseFloat(row.querySelector('.m-fat').value) || 0
                    });
                }
            });
        });

        const d = {
            id: Date.now(),
            member_id: state.activeMemberId,
            tarih: document.getElementById('d-date').value,
            plan_adi: document.getElementById('d-name').value,
            ogunler: JSON.stringify(ogunler)
        };
        const dietResult = await dataService.mutate('beslenme_planlari', 'upsert', d);
        if (dietResult.error) throw dietResult.error;
        window.pushToUndoLog('INSERT', 'beslenme_planlari', null, d, `Beslenme Planı: ${d.plan_adi}`);
        await sync();
        window.closeModal('modal-diet');
        alert("Beslenme planı başarıyla kaydedildi!");
    };

    window.showDietDetail = (id) => {
        try {
            const d = state.diets.find(x => x.id == id);
            if (!d) return;
            const meals = window.safeJSONParse(d.ogunler, []);

            let grandCal = 0, grandPro = 0, grandCarb = 0, grandFat = 0;

            // 1. Besinleri Öğün Adına (ogun_adi) Göre Grupla
            const groupedMeals = {};
            meals.forEach(m => {
                const mealName = m.ogun_adi || "Diğer / Tanımsız";
                if (!groupedMeals[mealName]) {
                    groupedMeals[mealName] = { items: [], tCal: 0, tPro: 0, tCarb: 0, tFat: 0 };
                }
                groupedMeals[mealName].items.push(m);
                groupedMeals[mealName].tCal += m.kalori || 0;
                groupedMeals[mealName].tPro += m.protein || 0;
                groupedMeals[mealName].tCarb += m.karbonhidrat || 0;
                groupedMeals[mealName].tFat += m.yag || 0;

                grandCal += m.kalori || 0;
                grandPro += m.protein || 0;
                grandCarb += m.karbonhidrat || 0;
                grandFat += m.yag || 0;
            });

            document.getElementById('detail-title').innerText = `${d.plan_adi} Detayı`;

            // 2. Gruplanmış Verileri Profesyonel UI ile Bas
            let html = `
                <div style="margin-bottom: 1.5rem; padding: 1.2rem; background: rgba(0, 242, 254, 0.05); border: 1px solid var(--primary); border-radius: 12px; text-align: center;">
                    <div style="color:var(--text-dim); font-size: 0.85rem; margin-bottom: 0.5rem;">Günlük Toplam Makrolar</div>
                    <div style="font-size: 1.2rem; font-weight: bold; color: #fff;">
                        🔥 ${grandCal.toFixed(0)} <span style="font-size:0.8rem; color:var(--text-dim); font-weight:normal;">kcal</span> &nbsp;|&nbsp;
                        P: <span style="color:var(--primary);">${grandPro.toFixed(0)}g</span> &nbsp;|&nbsp;
                        C: <span style="color:var(--accent);">${grandCarb.toFixed(0)}g</span> &nbsp;|&nbsp;
                        Y: <span style="color:#ffb142;">${grandFat.toFixed(0)}g</span>
                    </div>
                </div>
                <div class="diet-summary-container">
            `;

            for (const [mealName, data] of Object.entries(groupedMeals)) {
                html += `
                <div class="meal-group" style="margin-bottom: 1.2rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                    <div style="background: rgba(255,255,255,0.03); padding: 0.7rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: var(--text);">🍽️ ${escapeHtml(mealName)}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-dim);">
                            🔥 ${data.tCal.toFixed(1)} | P: ${data.tPro.toFixed(1)} | C: ${data.tCarb.toFixed(1)} | Y: ${data.tFat.toFixed(1)}
                        </span>
                    </div>
                    <div style="padding: 0.5rem 1rem;">
                        <table style="width: 100%; font-size: 0.85rem; text-align: left; border-collapse: collapse;">
                            <thead>
                                <tr style="color: var(--text-dim); border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <th style="padding: 0.4rem 0; width: 45%;">Besin</th>
                                    <th style="padding: 0.4rem 0; width: 20%;">Miktar</th>
                                    <th style="padding: 0.4rem 0; width: 15%;">Kcal</th>
                                    <th style="padding: 0.4rem 0; width: 20%;">P / C / Y</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                data.items.forEach(m => {
                    html += `
                                <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                                    <td style="padding: 0.6rem 0; color: #fff; font-weight: 500;">${escapeHtml(m.ad)}</td>
                                    <td style="padding: 0.6rem 0; color: var(--text-dim);">${escapeHtml(m.miktar)}</td>
                                    <td style="padding: 0.6rem 0; font-weight: bold; color: #fff;">${m.kalori}</td>
                                    <td style="padding: 0.6rem 0; font-size: 0.75rem; color: var(--text-dim);">${m.protein} / ${m.karbonhidrat} / ${m.yag}</td>
                                </tr>
                    `;
                });

                html += `
                            </tbody>
                        </table>
                    </div>
                </div>`;
            }

            html += '</div>';
            document.getElementById('detail-body').innerHTML = html;
            window.openModal('modal-detail');
        } catch (err) { console.error("Beslenme detayı açılırken hata:", err); }
    };

    window.deleteDietPlan = async (id) => {
        if (confirm("Silinsin mi?")) {
            const oldData = state.diets.find(d => d.id == id);
            const result = await dataService.mutate('beslenme_planlari', 'delete', null, { id });
            if (result.error) throw result.error;
            window.pushToUndoLog('DELETE', 'beslenme_planlari', oldData, null, `Plan Silindi: ${oldData.plan_adi}`);
            await sync();
        }
    };

    function refreshAll() {
        try {
            renderMembers();
            renderWeeklySchedule();
            renderAssessmentAdmin();
            renderWorkoutHistory();
            renderMeasurementHistory();
            if(typeof renderCardioHistory === 'function') renderCardioHistory();
            renderDocuments();
            renderPrograms();
            window.renderExercises();
            if (window.renderFoods) window.renderFoods();
            if (window.renderDietHistory) window.renderDietHistory();
            window.updateDashboardSummary();
            const loader = document.getElementById('form-template-loader');
            if(loader) loader.innerHTML = '<option value="">Şablon Seç...</option>' + state.programs.map(p=>`<option value="${p.id}">${escapeHtml(p.program_adi)}</option>`).join('');
        } catch (e) {
            console.error("RefreshAll Crash Protected:", e);
        }
    }

    function renderMembers() {
        const grid = document.getElementById('members-grid');
        if (!grid) return;
        const overview = document.getElementById('member-overview');
        if (overview) {
            const branchCount = new Set(state.members.map(member => member.brans).filter(Boolean)).size;
            const measuredCount = new Set(state.measurements.map(measurement => measurement.member_id)).size;
            const today = new Date();
            const todayDay = today.getDay() || 7;
            const todayMinutes = (today.getHours() * 60) + today.getMinutes();
            const todaySchedules = state.schedules.filter(item => Number(item.day_of_week) === todayDay);
            const upcomingToday = todaySchedules.filter(item => timeToMinutes(item.start_time) >= todayMinutes).length;
            const activeMembers = state.members.filter(member => member.auth_user_id).length;
            overview.innerHTML = `
                <div class="member-overview-card">
                    <span>Toplam danışan</span>
                    <strong>${state.members.length}</strong>
                </div>
                <div class="member-overview-card">
                    <span>Aktif branş</span>
                    <strong>${branchCount}</strong>
                </div>
                <div class="member-overview-card">
                    <span>Ölçümü bulunan</span>
                    <strong>${measuredCount}</strong>
                </div>
                <div class="member-overview-card">
                    <span>Bugünkü seanslar</span>
                    <strong>${todaySchedules.length}</strong>
                    <small>${upcomingToday} yaklaşan</small>
                </div>
                <div class="member-overview-card">
                    <span>Aktif / pasif üye</span>
                    <strong>${activeMembers} / ${Math.max(0, state.members.length - activeMembers)}</strong>
                    <small>${state.schedules.length} planlı seans</small>
                </div>
            `;
        }

        function renderAssessmentAdminLegacy() {
            const container = document.getElementById('assessment-admin-list');
            if (!container) return;
            if (!state.members.length) {
                container.innerHTML = '<div class="empty-state"><strong>Henüz danışan yok</strong><span>Üye kaydı tamamlandığında değerlendirme burada görünür.</span></div>';
                return;
            }
            container.innerHTML = state.members.map(member => {
                const completed = Boolean(member.degerlendirme_tamamlandi);
                const answers = window.safeJSONParse(member.degerlendirme_verileri, {});
                return `
                    <article class="card assessment-admin-card">
                        <div class="member-card-top">
                            <div>
                                <span class="eyebrow">${completed ? 'TAMAMLANDI' : 'BEKLENİYOR'}</span>
                                <h3>${escapePortalText(member.ad_soyad)}</h3>
                            </div>
                            <span aria-label="${completed ? 'Tamamlandı' : 'Bekleniyor'}">${completed ? '✓' : '…'}</span>
                        </div>
                        ${completed ? `
                            <p><strong>Hedef:</strong> ${escapePortalText(member.beklentiler)}</p>
                            <p><strong>Sağlık:</strong> ${escapePortalText(member.saglik_gecmisi)}</p>
                            <p><strong>Hareket:</strong> ${escapePortalText(member.hareket_aliskanliklari)}</p>
                            <p class="member-portal-muted">Boy: ${escapePortalText(member.boy)} cm · ${escapePortalText(answers.boy?.weight)} kg</p>
                        ` : '<p class="member-portal-muted">Danışan ilk girişinde anketi tamamladığında bilgiler burada görünecek.</p>'}
                        <button class="btn-secondary" type="button" onclick="window.openProfile(${member.id})">Üye kartını aç</button>
                    </article>`;
            }).join('');
        }

        const icons = { 'Fitness': '💪', 'Karate': '🥋', 'Basketbol': '🏀', 'Yoga': '🧘', 'Fonksiyonel Egzersiz': '⚡' };
        grid.innerHTML = state.members.length ? state.members.map(m => {
            const memberSchedule = state.schedules.filter(item => item.member_id == m.id)
                .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
            const scheduleText = memberSchedule.length
                ? memberSchedule.slice(0, 2).map(item => `${getScheduleDayName(item.day_of_week)} ${item.start_time.slice(0, 5)}`).join(' · ')
                : 'Henüz seans atanmadı';
            return `
            <div class="card member-card" onclick="window.openProfile(${m.id})">
                <div class="member-card-top">
                    <div class="member-avatar">${icons[m.brans] || '👤'}</div>
                    <span class="member-card-arrow">→</span>
                </div>
                <small class="member-card-trainer">Eğitmen: ${escapePortalText(m.trainer_id === 'burak-ozcan' ? 'Burak Özcan' : 'Atanmadı')}</small>
                <h3>${escapeHtml(m.ad_soyad)}</h3>
                <p class="member-branch">${escapeHtml(m.brans || 'Branş belirtilmemiş')}</p>
                <p class="member-schedule-summary">🗓️ ${escapePortalText(scheduleText)}</p>
                <div class="card-actions">
                    <button class="btn-edit" onclick="event.stopPropagation(); window.editMember(${m.id})">Düzenle</button>
                    <button class="btn-delete" onclick="event.stopPropagation(); window.deleteMember(${m.id})">Sil</button>
                </div>
            </div>
        `; }).join('') : '<div class="empty-state"><strong>Henüz danışan yok</strong><span>İlk danışanı ekleyerek başlayın.</span></div>';
    }

    const scheduleDays = [
        [1, 'Pazartesi'], [2, 'Salı'], [3, 'Çarşamba'], [4, 'Perşembe'],
        [5, 'Cuma'], [6, 'Cumartesi'], [7, 'Pazar']
    ];
    const getScheduleDayName = day => scheduleDays.find(([value]) => value === Number(day))?.[1] || 'Gün';
    const scheduleTimes = Array.from({ length: 29 }, (_, index) => {
        const totalMinutes = (6 * 60) + (index * 30);
        return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    });

    const scheduleBranches = ['Fitness', 'Karate', 'Basketbol', 'Yoga', 'Fonksiyonel Egzersiz'];
    const scheduleTimeOptions = (selected = '') => `<option value="">Seçin</option>${scheduleTimes.map(time =>
        `<option value="${time}" ${time === selected ? 'selected' : ''}>${time}</option>`).join('')}`;
    const scheduleDayOptions = (selected = 1) => scheduleDays.map(([value, label]) =>
        `<option value="${value}" ${Number(selected) === value ? 'selected' : ''}>${label}</option>`).join('');
    const scheduleBranchOptions = (selected = 'Fitness') => scheduleBranches.map(branch =>
        `<option value="${branch}" ${branch === selected ? 'selected' : ''}>${branch}</option>`).join('');

    function renderScheduleRows(rows = [{}]) {
        const container = document.getElementById('schedule-rows');
        if (!container) return;
        container.innerHTML = rows.map((row, index) => `
            <div class="schedule-row" data-schedule-row>
                <select data-schedule-day aria-label="Seans günü" required>${scheduleDayOptions(row.day_of_week || index + 1)}</select>
                <select data-schedule-start aria-label="Başlangıç saati" required>${scheduleTimeOptions(row.start_time?.slice(0, 5))}</select>
                <select data-schedule-end aria-label="Bitiş saati" required>${scheduleTimeOptions(row.end_time?.slice(0, 5))}</select>
                <select data-schedule-branch aria-label="Branş" required>${scheduleBranchOptions(row.branch)}</select>
                <button class="btn-delete schedule-remove-row" type="button" aria-label="Seansı kaldır"
                    onclick="this.closest('[data-schedule-row]').remove()">×</button>
            </div>`).join('');
        container.querySelectorAll('[data-schedule-row]').forEach(row => {
            row.querySelector('[data-schedule-start]').addEventListener('change', event => {
                const end = row.querySelector('[data-schedule-end]');
                if (!end.value || end.value <= event.target.value) {
                    end.value = scheduleTimes[Math.min(scheduleTimes.indexOf(event.target.value) + 1, scheduleTimes.length - 1)];
                }
            });
        });
    }

    window.addScheduleRow = () => {
        const rows = [...document.querySelectorAll('[data-schedule-row]')].map(row => ({
            day_of_week: row.querySelector('[data-schedule-day]').value,
            start_time: row.querySelector('[data-schedule-start]').value,
            end_time: row.querySelector('[data-schedule-end]').value,
            branch: row.querySelector('[data-schedule-branch]').value
        }));
        rows.push({});
        renderScheduleRows(rows);
    };

    const scheduleTrainers = [{ id: 'burak-ozcan', full_name: 'Burak Özcan' }];
    const scheduleFilters = { memberId: '', trainerId: '', branch: '' };

    window.applyScheduleFilters = () => {
        scheduleFilters.memberId = document.getElementById('schedule-filter-member')?.value || '';
        scheduleFilters.trainerId = document.getElementById('schedule-filter-trainer')?.value || '';
        scheduleFilters.branch = document.getElementById('schedule-filter-branch')?.value || '';
        renderWeeklySchedule();
    };

    function renderScheduleFilters() {
        const memberSelect = document.getElementById('schedule-filter-member');
        const trainerSelect = document.getElementById('schedule-filter-trainer');
        const branchSelect = document.getElementById('schedule-filter-branch');
        if (memberSelect) {
            memberSelect.innerHTML = '<option value="">Tümü</option>' +
                state.members.map(member => `<option value="${member.id}">${escapePortalText(member.ad_soyad)}</option>`).join('');
            memberSelect.value = scheduleFilters.memberId;
        }
        if (trainerSelect) {
            trainerSelect.innerHTML = '<option value="">Tümü</option>' +
                scheduleTrainers.map(trainer => `<option value="${trainer.id}">${escapePortalText(trainer.full_name)}</option>`).join('');
            trainerSelect.value = scheduleFilters.trainerId;
        }
        if (branchSelect) {
            branchSelect.innerHTML = '<option value="">Tümü</option>' +
                scheduleBranches.map(branch => `<option value="${escapePortalText(branch)}">${escapePortalText(branch)}</option>`).join('');
            branchSelect.value = scheduleFilters.branch;
        }
    }

    function renderWeeklySchedule() {
        const container = document.getElementById('weekly-schedule-grid');
        if (!container) return;
        renderScheduleFilters();
        const entries = (state.schedules || []).filter(item =>
            (!scheduleFilters.memberId || String(item.member_id) === String(scheduleFilters.memberId)) &&
            (!scheduleFilters.trainerId || String(item.trainer_id || 'burak-ozcan') === String(scheduleFilters.trainerId)) &&
            (!scheduleFilters.branch || item.branch === scheduleFilters.branch)
        );
        const conflictIds = getScheduleConflictIds(state.schedules || []);
        container.innerHTML = scheduleDays.map(([day, label]) => {
            const dayEntries = entries.filter(item => Number(item.day_of_week) === day)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
            const conflictCount = dayEntries.filter(item => conflictIds.has(String(item.id))).length;
            return `<section class="weekly-schedule-day">
                <h3>${label}${conflictCount ? ` <span class="weekly-schedule-conflict-count">${conflictCount} çakışma</span>` : ''}</h3>
                ${dayEntries.length ? dayEntries.map(item => {
                    const member = state.members.find(candidate => candidate.id == item.member_id);
                    const hasConflict = conflictIds.has(String(item.id));
                    const hasInvalidTime = !isValidScheduleTime(item.start_time) ||
                        (item.end_time && !isValidScheduleTime(item.end_time));
                    const conflictLabel = hasConflict
                        ? 'Bu üyenin başka bir seansıyla zaman çakışması var.'
                        : '';
                    const invalidLabel = hasInvalidTime ? 'Saat bilgisi geçersiz, düzenlenmesi gerekiyor.' : '';
                    const displayStart = isValidScheduleTime(item.start_time) ? item.start_time.slice(0, 5) : '--:--';
                    const displayEnd = isValidScheduleTime(item.end_time) ? ` - ${item.end_time.slice(0, 5)}` : '';
                    return `<button class="weekly-schedule-entry${hasConflict ? ' is-conflict' : ''}${hasInvalidTime ? ' is-invalid' : ''}" type="button"
                        aria-label="${escapePortalText(`${displayStart} ${member?.ad_soyad || 'Üye bulunamadı'} ${item.branch || ''} ${conflictLabel} ${invalidLabel}`)}"
                        title="${escapePortalText(`${conflictLabel} ${invalidLabel}`.trim())}"
                        onclick="window.openScheduleEditor(${item.id})">
                        <strong>${escapePortalText(displayStart)}${escapePortalText(displayEnd)}</strong>
                        <span>${escapePortalText(member?.ad_soyad || 'Üye bulunamadı')}</span>
                        <small>${escapePortalText(item.branch)}${hasConflict ? ' · ÇAKIŞMA' : ''}${hasInvalidTime ? ' · SAATİ DÜZELT' : ''}</small>
                    </button>`;
                }).join('') : '<p class="weekly-schedule-empty">Boş</p>'}
            </section>`;
        }).join('');
    }

    const isValidScheduleTime = value => {
        if (typeof value !== 'string' || !/^\d{2}:\d{2}/.test(value)) return false;
        const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    };

    const timeToMinutes = value => {
        const [hours, minutes] = String(value || '').slice(0, 5).split(':').map(Number);
        return (hours * 60) + minutes;
    };

    const scheduleEndMinutes = schedule => schedule.end_time
        ? timeToMinutes(schedule.end_time)
        : timeToMinutes(schedule.start_time) + 30;

    const schedulesOverlap = (left, right) => (
        isValidScheduleTime(left.start_time) &&
        isValidScheduleTime(right.start_time) &&
        (!left.end_time || isValidScheduleTime(left.end_time)) &&
        (!right.end_time || isValidScheduleTime(right.end_time)) &&
        Number(left.member_id) === Number(right.member_id) &&
        Number(left.day_of_week) === Number(right.day_of_week) &&
        timeToMinutes(left.start_time) < scheduleEndMinutes(right) &&
        timeToMinutes(right.start_time) < scheduleEndMinutes(left)
    );

    function getScheduleConflictIds(entries) {
        const conflictIds = new Set();
        entries.forEach((entry, index) => {
            entries.slice(index + 1).forEach(other => {
                if (schedulesOverlap(entry, other)) {
                    conflictIds.add(String(entry.id));
                    conflictIds.add(String(other.id));
                }
            });
        });
        return conflictIds;
    }

    function findScheduleConflict(candidateRows, excludedId = '') {
        const existing = (state.schedules || []).filter(item => String(item.id) !== String(excludedId));
        for (const row of candidateRows) {
            const candidate = { ...row, member_id: row.member_id };
            const conflict = existing.find(item => schedulesOverlap(candidate, item));
            if (conflict) return conflict;
        }
        for (let index = 0; index < candidateRows.length; index += 1) {
            for (let otherIndex = index + 1; otherIndex < candidateRows.length; otherIndex += 1) {
                if (schedulesOverlap(candidateRows[index], candidateRows[otherIndex])) {
                    return candidateRows[otherIndex];
                }
            }
        }
        return null;
    }

    function populateScheduleMembers(selectedId = '') {
        const select = document.getElementById('schedule-member');
        if (!select) return;
        select.innerHTML = '<option value="">Üye seçin...</option>' +
            state.members.map(member => `<option value="${member.id}" ${String(member.id) === String(selectedId) ? 'selected' : ''}>${escapePortalText(member.ad_soyad)}</option>`).join('');
    }

    window.startWeeklySchedule = () => {
        window.nav('schedule-view');
        document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));
        document.getElementById('btn-schedule')?.classList.add('active');
    };

    window.openScheduleEditor = (id = '') => {
        const entry = id ? state.schedules.find(item => item.id == id) : null;
        document.getElementById('schedule-modal-title').textContent = entry ? 'Seansı düzenle' : 'Haftalık programa ekle';
        document.getElementById('schedule-id').value = entry?.id || '';
        populateScheduleMembers(entry?.member_id || '');
        renderScheduleRows(entry ? [entry] : [{}]);
        document.getElementById('schedule-notes').value = entry?.notes || '';
        document.getElementById('schedule-delete').hidden = !entry;
        window.openModal('modal-schedule');
    };

    window.saveScheduleEntry = async event => {
        event.preventDefault();
        const id = document.getElementById('schedule-id').value;
        const memberId = document.getElementById('schedule-member').value;
        if (!memberId) {
            alert('Lütfen programa atanacak üyeyi seçin.');
            return;
        }
        const assignedMember = state.members.find(member => String(member.id) === String(memberId));
        if (!assignedMember?.trainer_id) {
            alert('Bu üyeye önce yönetici panelindeki üye kartından bir eğitmen atayın.');
            return;
        }
        const rows = [...document.querySelectorAll('[data-schedule-row]')].map(row => ({
            member_id: Number(memberId),
            day_of_week: Number(row.querySelector('[data-schedule-day]').value),
            start_time: row.querySelector('[data-schedule-start]').value,
            end_time: row.querySelector('[data-schedule-end]').value,
            branch: row.querySelector('[data-schedule-branch]').value,
            trainer_id: assignedMember.trainer_id
        }));
        if (!rows.length || rows.some(row => !isValidScheduleTime(row.start_time) || !isValidScheduleTime(row.end_time))) {
            alert('Lütfen her seans için gün, başlangıç ve bitiş saati seçin.');
            return;
        }
        if (rows.some(row => row.end_time <= row.start_time)) {
            alert('Bitiş saati başlangıç saatinden sonra olmalıdır.');
            return;
        }
        const keys = rows.map(row => `${row.day_of_week}-${row.start_time}`);
        if (new Set(keys).size !== keys.length) {
            alert('Aynı gün ve başlangıç saati yalnızca bir kez eklenebilir.');
            return;
        }
        const conflict = findScheduleConflict(rows, id);
        if (conflict) {
            const conflictEnd = conflict.end_time?.slice(0, 5) ||
                `${String(Math.floor(scheduleEndMinutes(conflict) / 60)).padStart(2, '0')}:${String(scheduleEndMinutes(conflict) % 60).padStart(2, '0')}`;
            alert(`Bu üyenin ${getScheduleDayName(conflict.day_of_week)} günü ${conflict.start_time.slice(0, 5)} - ${conflictEnd} arasında${conflict.branch ? ` ${conflict.branch}` : ''} seansı var. Çakışan seansları düzeltmeden kaydedemezsiniz.`);
            return;
        }
        const baseData = {
            member_id: memberId,
            trainer_id: assignedMember.trainer_id,
            notes: document.getElementById('schedule-notes').value.trim(),
            updated_at: new Date().toISOString()
        };
        const entries = rows.map((row, index) => ({
            ...baseData, ...row,
            id: id && index === 0 ? id : Date.now() + index
        }));
        const { error } = await dataService.mutate('weekly_program_schedule', 'upsert', entries);
        if (error) {
            handleError(error, 'Schedule save');
            alert(`Çizelge kaydedilemedi: ${error.message}`);
            return;
        }
        await Promise.all(rows.map((row, index) => createScheduleNotification({
            memberId,
            scheduleId: id && index === 0 ? id : entries[index].id,
            action: id && index === 0 ? 'updated' : 'created',
            message: `${getScheduleDayName(row.day_of_week)} günü ${row.start_time.slice(0, 5)} - ${row.end_time.slice(0, 5)} ${row.branch} seansı.`
        })));
        const member = state.members.find(item => item.id == memberId);
        const primaryBranch = rows[0].branch;
        if (member && member.brans !== primaryBranch) {
            const { error: memberError } = await dataService.mutate('uyeler', 'update', { brans: primaryBranch }, { id: memberId });
            if (memberError) {
                handleError(memberError, 'Schedule member branch update');
                alert(`Seans kaydedildi ancak üye branşı güncellenemedi: ${memberError.message}`);
            }
        }
        await sync();
        window.closeModal('modal-schedule');
    };

    window.deleteScheduleEntry = async () => {
        const id = document.getElementById('schedule-id').value;
        if (!id || !confirm('Bu seans çizelgeden silinsin mi?')) return;
        const deletedEntry = state.schedules.find(item => String(item.id) === String(id));
        const { error } = await dataService.mutate('weekly_program_schedule', 'delete', null, { id });
        if (error) {
            handleError(error, 'Schedule delete');
            alert(`Seans silinemedi: ${error.message}`);
            return;
        }
        if (deletedEntry) {
            await createScheduleNotification({
                memberId: deletedEntry.member_id,
                scheduleId: id,
                action: 'deleted',
                message: `${getScheduleDayName(deletedEntry.day_of_week)} günü ${deletedEntry.start_time.slice(0, 5)} ${deletedEntry.branch} seansı kaldırıldı.`
            });
        }
        await sync();
        window.closeModal('modal-schedule');
    };

    function renderAssessmentAdmin() {
        const container = document.getElementById('assessment-admin-list');
        if (!container) return;
        if (!state.members.length) {
            container.innerHTML = '<div class="empty-state"><strong>Henüz danışan yok</strong><span>Üye kaydı tamamlandığında değerlendirme burada görünecek.</span></div>';
            return;
        }
        container.innerHTML = state.members.map(member => {
            const completed = Boolean(member.degerlendirme_tamamlandi);
            const answers = window.safeJSONParse(member.degerlendirme_verileri, {});
            return `
                <article class="card assessment-admin-card" role="button" tabindex="0"
                    onclick="window.openAssessmentDetails(${member.id})"
                    onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.openAssessmentDetails(${member.id}); }">
                    <div class="member-card-top">
                        <div>
                            <span class="eyebrow">${completed ? 'TAMAMLANDI' : 'BEKLENİYOR'}</span>
                            <h3>${escapePortalText(member.ad_soyad)}</h3>
                        </div>
                        <span aria-label="${completed ? 'Tamamlandı' : 'Bekleniyor'}">${completed ? '✓' : '…'}</span>
                    </div>
                    ${completed ? `
                        <p><strong>Hedef:</strong> ${escapePortalText(member.beklentiler)}</p>
                        <p><strong>Sağlık:</strong> ${escapePortalText(member.saglik_gecmisi)}</p>
                        <p><strong>Hareket:</strong> ${escapePortalText(member.hareket_aliskanliklari)}</p>
                        <p class="member-portal-muted">Boy: ${escapePortalText(member.boy)} cm · ${escapePortalText(answers.boy?.weight)} kg</p>
                    ` : '<p class="member-portal-muted">Danışan ilk girişinde anketi tamamladığında bilgiler burada görünecek.</p>'}
                    <div class="assessment-admin-actions">
                        <button class="btn-secondary" type="button"
                            onclick="event.stopPropagation(); window.openAssessmentDetails(${member.id})">Anket detayları</button>
                        <button class="btn-secondary" type="button"
                            onclick="event.stopPropagation(); window.openProfile(${member.id})">Üye kartını aç</button>
                    </div>
                </article>`;
        }).join('');
    }

    window.openAssessmentDetails = (memberId) => {
        const member = state.members.find(item => item.id == memberId);
        if (!member) return;
        const answers = window.safeJSONParse(member.degerlendirme_verileri, {});
        const formatValue = value => Array.isArray(value) ? value.join(', ') : (value || 'Belirtilmedi');
        const rows = [
            ['Ad Soyad', answers.ad_soyad || member.ad_soyad],
            ['Cep telefonu', answers.telefon || member.telefon],
            ['Doğum tarihi', answers.dogum_tarihi || member.dogum_tarihi],
            ['Cinsiyet', answers.cinsiyet || member.cinsiyet],
            ['Boy', answers.boy?.height ? `${answers.boy.height} cm` : member.boy ? `${member.boy} cm` : 'Belirtilmedi'],
            ['Mevcut kilo', answers.boy?.weight ? `${answers.boy.weight} kg` : 'Belirtilmedi'],
            ['Hastalık geçmişi', answers.saglik_gecmisi || member.saglik_gecmisi],
            ['Alerjiler', answers.alerjiler || member.alerjiler],
            ['Beslenme alışkanlıkları', answers.beslenme_aliskanliklari || member.beslenme_aliskanliklari],
            ['Hareket alışkanlıkları', answers.hareket_aliskanliklari || member.hareket_aliskanliklari],
            ['Spor geçmişi', answers.spor_gecmisi || member.spor_gecmisi],
            ['Hizmet beklentileri', answers.beklentiler || member.beklentiler]
        ];
        document.getElementById('detail-title').textContent = `Akıllı Değerlendirme · ${member.ad_soyad}`;
        document.getElementById('detail-body').innerHTML = `
            <p class="member-portal-muted assessment-detail-intro">
                ${member.degerlendirme_tarihi ? `Tamamlanma: ${escapePortalText(new Date(member.degerlendirme_tarihi).toLocaleString('tr-TR'))}` : 'Değerlendirme tamamlanmadı.'}
            </p>
            <dl class="assessment-detail-list">
                ${rows.map(([label, value]) => `
                    <div>
                        <dt>${escapePortalText(label)}</dt>
                        <dd>${escapePortalText(formatValue(value))}</dd>
                    </div>`).join('')}
            </dl>`;
        window.openModal('modal-detail');
    };

    window.startSurvey = () => {
        window.nav('assessment-view');
        document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));
        document.getElementById('btn-survey')?.classList.add('active');
    };

    window.renderExercises = () => {
        const container = document.getElementById('exercises-grid');
        if (!container) return;

        const filterBodyPart = document.getElementById('filter-ex-bodypart')?.value || '';
        const filterClassification = document.getElementById('filter-ex-classification')?.value || '';
        const filterMuscle = document.getElementById('filter-ex-muscle')?.value || '';
        const filterBranch = document.getElementById('filter-ex-branch')?.value || '';
        const filterYogaStyle = document.getElementById('filter-ex-yoga-style')?.value || '';
        const filterKarateDrill = document.getElementById('filter-ex-karate-drill')?.value || '';
        const filterKarateRank = document.getElementById('filter-ex-karate-rank')?.value || '';
        const filterKarateStyle = document.getElementById('filter-ex-karate-style')?.value || '';
        const filterEquipment = document.getElementById('filter-ex-equipment')?.value || '';

        const groups = { 'Üst Ekstremite': [], 'Alt Ekstremite': [], 'Branşa Özel': [], 'Genel': [] };

        state.exercises.forEach(ex => {
            if (!window.TrainerProExerciseDomain.matchesFilters(ex, {
                bodyPart: filterBodyPart,
                classification: filterClassification,
                muscle: filterMuscle,
                branch: filterBranch,
                yogaStyle: filterYogaStyle,
                karateDrill: filterKarateDrill,
                karateRank: filterKarateRank,
                karateStyle: filterKarateStyle,
                equipment: filterEquipment
            })) return;

            const g = window.TrainerProExerciseDomain.normalize(ex);
            const exBodyPart = g.bodyPart;
            const exBranch = g.branch;

            if (exBodyPart === 'Üst Ekstremite') groups['Üst Ekstremite'].push(ex);
            else if (exBodyPart === 'Alt Ekstremite') groups['Alt Ekstremite'].push(ex);
            else if (exBranch !== 'Fitness') groups['Branşa Özel'].push(ex);
            else groups['Genel'].push(ex);
        });

        const isFiltered = filterBodyPart || filterClassification || filterMuscle || filterBranch ||
            filterYogaStyle || filterKarateDrill || filterKarateRank || filterKarateStyle || filterEquipment;

        container.innerHTML = Object.entries(groups).map(([name, list]) => {
            if (list.length === 0) return '';
            const safeName = name.replace(/\s+/g, '-');
            const displayStyle = isFiltered ? 'block' : 'none';
            const activeClass = isFiltered ? 'active' : '';

            return `
                <div class="accordion mt-1 ${activeClass}">
                    <div class="acc-header" onclick="window.toggleAcc(${jsAttr(`ex-group-${safeName}`)})">
                        <h3>${escapeHtml(name)} (${list.length})</h3>
                        <span>▼</span>
                    </div>
                    <div id="ex-group-${escapeHtml(safeName)}" class="acc-body grid" style="display: ${displayStyle}">
                        ${list.map(ex => {
                            let tagsHtml = '';
                            const g = window.TrainerProExerciseDomain.normalize(ex);
                            if (g.bodyPart) tagsHtml += `<span class="tag">${escapeHtml(g.bodyPart)}</span>`;
                            if (g.classification) g.classification.forEach(c => tagsHtml += `<span class="tag">${escapeHtml(c)}</span>`);
                            if (g.muscles) g.muscles.forEach(m => tagsHtml += `<span class="tag secondary">${escapeHtml(m)}</span>`);
                            if (g.branch) tagsHtml += `<span class="tag accent">${escapeHtml(g.branch)}</span>`;
                            else if (ex.brans) tagsHtml += `<span class="tag accent">${escapeHtml(ex.brans)}</span>`;
                            if (g.styles) g.styles.forEach(style => tagsHtml += `<span class="tag secondary">Stil: ${escapeHtml(style)}</span>`);
                            if (g.style) tagsHtml += `<span class="tag secondary">Stil: ${escapeHtml(g.style)}</span>`;
                            if (g.drill) tagsHtml += `<span class="tag secondary">Drill: ${escapeHtml(g.drill)}</span>`;
                            if (g.rank) tagsHtml += `<span class="tag secondary">Seviye: ${escapeHtml(g.rank)}</span>`;
                            if (g.equipment) tagsHtml += `<span class="tag">${escapeHtml(g.equipment)}</span>`;
                            if (g.level) tagsHtml += `<span class="tag secondary">${escapeHtml(g.level)}</span>`;
                            if (g.sanskritName) tagsHtml += `<span class="tag secondary">Sanskrit: ${escapeHtml(g.sanskritName)}</span>`;
                            if (g.japaneseName) tagsHtml += `<span class="tag secondary">日本語: ${escapeHtml(g.japaneseName)}</span>`;

                            return `
                            <div class="card">
                                <h3>${escapeHtml(ex.ad)}</h3>
                                <div class="tags-container">${tagsHtml}</div>
                                <div class="card-actions mt-1">
                                    <button class="btn-edit" onclick="window.editExercise(${ex.id})">✎</button>
                                    <button class="btn-delete" onclick="window.deleteExercise(${ex.id})">🗑</button>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                </div>
            `;
        }).join('');

        if (container.innerHTML === '') {
            container.innerHTML = '<div class="no-results mt-1">Kriterlere uygun egzersiz bulunamadı.</div>';
        }
    }

    function renderPrograms() {
        const container = document.getElementById('programs-by-branch');
        if (!container) return;
        const branches = [...new Set(state.exercises.map(e => e.brans).concat(['Fitness']))].filter(Boolean);
        container.innerHTML = branches.map(br => {
            const myProgs = state.programs.filter(p => {
                const details = window.safeJSONParse(p.detaylar, []);
                return details.some(ex => state.exercises.find(e => e.ad === ex.ad && e.brans === br));
            });
            if (myProgs.length === 0 && br !== 'Fitness') return '';

            return `
                <div class="accordion">
                    <div class="acc-header" onclick="window.toggleAcc(${jsAttr(`br-${br.replace(/\s+/g, '-')}`)})">
                        <h3>${escapeHtml(br)} Şablonları (${myProgs.length})</h3>
                        <span>▼</span>
                    </div>
                    <div id="br-${escapeHtml(br.replace(/\s+/g, '-'))}" class="acc-body grid">
                        ${myProgs.map(p => `
                            <div class="card" onclick="window.showProgramDetail(${p.id})">
                                <h3>${escapeHtml(p.program_adi)}</h3>
                                <div class="card-actions">
                                    <button class="btn-edit" onclick="event.stopPropagation(); window.editProgram(${p.id})">✎</button>
                                    <button class="btn-delete" onclick="event.stopPropagation(); window.deleteProgram(${p.id})">🗑 Sil</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }


    function renderCardioHistory() {
        const container = document.getElementById('c-history-tabs');
        if (!container) return;
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId && (m.vo2max || m.rhr || m.bmr)).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myM.length === 0) { container.innerHTML = '<div class="no-results mt-1">Test verisi yok.</div>'; return; }
        container.innerHTML = myM.map(m => `
            <div class="card mt-1" onclick="window.showMeasurementDetail(${m.id})" style="cursor:pointer; background: rgba(0, 128, 255, 0.05); border: 1px solid rgba(0, 128, 255, 0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="color: var(--accent);">🫀 ${new Date(m.tarih).toLocaleDateString('tr-TR')}</h3>
                    <div class="card-actions">
                        <button class="btn-edit" onclick="event.stopPropagation(); window.editCardioTest(${m.id})">✎</button>
                        <button class="btn-delete" onclick="event.stopPropagation(); window.deleteMeasurement(${m.id})">🗑</button>
                    </div>
                </div>
                <p>VO2 Max: ${m.vo2max || '--'} ml/kg/min | RHR: ${m.rhr || '--'} bpm | MHR: ${m.mhr || '--'} bpm</p>
                <p>HRR: ${m.hrr || '--'} bpm | BMR: ${m.bmr || '--'} kcal | Test Sonu Nabız: ${m.cooper || '--'} bpm</p>
            </div>
        `).join('');
    }

    function renderMeasurementHistory() {
        const container = document.getElementById('m-history-tabs');
        const summaryContainer = document.getElementById('measurement-summary');
        if (!container) return;
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myM.length === 0) {
            container.innerHTML = '<div class="no-results mt-1">Ölçüm yok.</div>';
            if (summaryContainer) summaryContainer.innerHTML = '';
            return;
        }

        const latest = myM[0];
        const previous = myM[1] || null;
        if (summaryContainer) {
            const summaryFields = MEASUREMENT_FIELDS.filter(field =>
                ['weight', 'fat', 'waist', 'chest', 'l_arm', 'l_bacak'].includes(field.key)
            );
            const comparisonLabel = previous
                ? `Önceki ölçüm: ${new Date(previous.tarih).toLocaleDateString('tr-TR')}`
                : 'Karşılaştırma için sonraki ölçümü bekliyor';
            summaryContainer.innerHTML = `
                <div class="measurement-summary-header">
                    <div>
                        <span class="summary-label">Son ölçüm</span>
                        <strong>${new Date(latest.tarih).toLocaleDateString('tr-TR')}</strong>
                    </div>
                    <span class="summary-label">${comparisonLabel}</span>
                </div>
                <div class="measurement-summary-grid">
                    ${summaryFields.map(field => {
                        const value = latest[field.key];
                        const delta = getMeasurementDelta(latest, previous, field.key);
                        return `<div class="measurement-summary-item">
                            <span>${field.label}</span>
                            <strong>${value ?? '--'} ${field.unit}</strong>
                            <small class="${getDeltaClass(delta, field.direction)}">${formatDelta(delta, field.unit)}</small>
                        </div>`;
                    }).join('')}
                </div>
                <p class="measurement-summary-note">
                    ${previous
                        ? 'Değişimler bir önceki ölçümle karşılaştırılır.'
                        : 'Bu danışan için ilk ölçüm kaydıdır; değişim değerleri sonraki kayıtta oluşacaktır.'}
                </p>
            `;
        }

        container.innerHTML = myM.map((m, index) => {
            const previousMeasurement = myM[index + 1] || null;
            const keyFields = MEASUREMENT_FIELDS.slice(0, 2);
            const deltaHtml = keyFields.map(field => {
                const delta = getMeasurementDelta(m, previousMeasurement, field.key);
                return `<span class="measurement-delta ${getDeltaClass(delta, field.direction)}">
                    ${field.label}: ${formatDelta(delta, field.unit)}
                </span>`;
            }).join('');
            return `
            <div class="card mt-1 measurement-history-card" onclick="window.showMeasurementDetail(${m.id})">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>${new Date(m.tarih).toLocaleDateString('tr-TR')}</h3>
                    <div class="card-actions">
                        <button class="btn-edit" onclick="event.stopPropagation(); window.editMeasurement(${m.id})">✎</button>
                        <button class="btn-delete" onclick="event.stopPropagation(); window.deleteMeasurement(${m.id})">🗑</button>
                    </div>
                </div>
                <p>Kilo: ${m.weight ?? '--'}kg | Yağ: %${m.fat ?? '--'}</p>
                <div class="measurement-deltas">${deltaHtml}</div>
            </div>
        `;
        }).join('');
    }

    function renderWorkoutHistory() {
        const container = document.getElementById('workout-history-tree');
        if (!container) return;
        const myW = state.workouts.filter(w => w.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myW.length === 0) { container.innerHTML = '<div class="no-results mt-1">Antrenman yok.</div>'; return; }
        container.innerHTML = myW.map(w => `
            <div class="workout-item" onclick="window.showWorkoutDetail(${w.id})" style="cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><div class="workout-meta">${new Date(w.tarih).toLocaleDateString('tr-TR')}</div><h3>${escapeHtml(w.sablon)}</h3></div>
                    <div class="card-actions">
                        <button class="btn-delete" onclick="event.stopPropagation(); window.deleteWorkout(${w.id})">🗑</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function renderDocuments() {
        const container = document.getElementById('doc-list');
        if (!container) return;
        const myDocs = state.documents.filter(d => d.member_id == state.activeMemberId);
        const myCloudFiles = (state.cloudFiles || []).filter(f => !myDocs.some(d => d.yol === `${state.activeMemberId}/${f.name}`));

        let html = myDocs.map(d => `
            <div class="doc-card">
                <div class="doc-info"><h4>${escapeHtml(d.adi)}</h4><span>${escapeHtml(d.tip || 'Dosya')}</span></div>
                <div class="doc-actions">
                    <button onclick="window.viewDocument(${jsAttr(d.yol)})" class="btn-view">👁</button>
                    <button onclick="window.deleteDocument(${d.id}, ${jsAttr(d.yol)})" class="btn-delete">🗑</button>
                </div>
            </div>
        `).join('');

        html += myCloudFiles.map(f => `
            <div class="doc-card">
                <div class="doc-info"><h4>${escapeHtml(f.name.split('_').slice(1).join('_') || f.name)}</h4><span>Bulut</span></div>
                <div class="doc-actions">
                    <button onclick="window.viewDocument(${jsAttr(`${state.activeMemberId}/${f.name}`)})" class="btn-view">👁</button>
                    <button onclick="window.deleteOnlyCloudDoc(${jsAttr(`${state.activeMemberId}/${f.name}`)})" class="btn-delete">🗑</button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html || '<div class="no-results mt-1">Döküman bulunamadı.</div>';
    }

    // --- CRUD OPERATIONS ---

        window.editMember = (id) => {
        const m = state.members.find(x => x.id == id);
        if (!m) return;
        document.getElementById('edit-member-id').value = m.id;
        document.getElementById('m-name').value = m.ad_soyad;
        document.getElementById('m-branch').value = m.brans;
        document.getElementById('m-trainer').value = m.trainer_id || '';
        if(document.getElementById('m-height')) { document.getElementById('m-height').value = m.boy || ''; }
        if(document.getElementById('m-gender')) { document.getElementById('m-gender').value = m.cinsiyet || 'Erkek'; }
        if(document.getElementById('m-reg-date')) { document.getElementById('m-reg-date').value = m.kayit_tarihi || ''; }
        window.openModal('modal-member');
    };

    window.handleMemberSubmit = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('edit-member-id').value;
        const id = existingId || Date.now();
        const oldData = existingId ? state.members.find(m => m.id == existingId) : null;
        const heightVal = document.getElementById('m-height') ? parseFloat(document.getElementById('m-height').value) : null;
        const m = {
            id,
            ad_soyad: document.getElementById('m-name').value.trim(),
            brans: document.getElementById('m-branch').value,
            trainer_id: document.getElementById('m-trainer').value || null,
            boy: heightVal || null,
            cinsiyet: document.getElementById('m-gender').value,
            kayit_tarihi: document.getElementById('m-reg-date').value
        };
        const { error } = await dataService.mutate('uyeler', 'upsert', m);
        if (error) {
            console.error('[Member save] Supabase error:', error);
            alert(`Üye kaydedilemedi: ${error.message}`);
            return;
        }
        window.pushToUndoLog(existingId ? 'UPDATE' : 'INSERT', 'uyeler', oldData, m, `Üye: ${m.ad_soyad}`);
        await sync();
        window.closeModal('modal-member');
    };

    window.editExercise = (id) => {
        const ex = state.exercises.find(e => e.id == id);
        if (!ex) return;
        document.getElementById('edit-ex-id').value = ex.id;
        document.getElementById('new-ex-name').value = ex.ad;
        document.getElementById('ex-modal-title').innerText = 'Egzersizi Düzenle';
        const g = window.safeJSONParse(ex.gruplar, {});
        document.getElementById('group-body-part').value = g.bodyPart || '';
        window.toggleBodyPartOptions(g.bodyPart || '', g.muscles || []);
        document.getElementById('new-ex-branch').value = g.branch || ex.brans || 'Fitness';
        document.getElementById('new-ex-equipment').value = g.equipment || '';
        document.getElementById('new-ex-level').value = g.level || 'Başlangıç';
        window.openModal('modal-new-exercise');
    };

    window.toggleBodyPartOptions = (val, selectedMuscles = []) => {
        const container = document.getElementById('group-muscles-container');
        const grid = document.getElementById('muscles-checkboxes');
        grid.innerHTML = '';
        if (!val) { container.style.display = 'none'; return; }
        const options = {
            'Üst Ekstremite': ['Göğüs', 'Omuz', 'Sırt', 'Biceps', 'Triceps', 'Ön Kol'],
            'Alt Ekstremite': ['Glute', 'Hamstring', 'Quad', 'Calf'],
            'Tüm Vücut': ['Core', 'Göğüs', 'Omuz', 'Sırt', 'Glute', 'Hamstring', 'Quad', 'Calf']
        };
        const muscles = options[val] || [];
        grid.innerHTML = muscles.map(m => `
            <label class="check-item">
                <input type="checkbox" name="muscle" value="${m}" ${selectedMuscles.includes(m) ? 'checked' : ''}>
                <span>${m}</span>
            </label>
        `).join('');
        container.style.display = 'block';
    };

    window.saveNewExercise = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('edit-ex-id').value;
        const id = existingId || Date.now();
        const muscles = Array.from(document.querySelectorAll('input[name="muscle"]:checked')).map(cb => cb.value);
        const gruplar = {
            bodyPart: document.getElementById('group-body-part').value,
            branch: document.getElementById('new-ex-branch').value,
            muscles,
            equipment: document.getElementById('new-ex-equipment').value.trim(),
            level: document.getElementById('new-ex-level').value
        };
        const newData = {
            id,
            ad: document.getElementById('new-ex-name').value,
            brans: gruplar.branch,
            gruplar: JSON.stringify(gruplar),
            body_part: gruplar.bodyPart || null,
            classifications: [],
            style: gruplar.style || null,
            drill: gruplar.drill || null,
            difficulty: gruplar.level || null
        };
        const { error } = await dataService.mutate('master_egzersizler', 'upsert', newData);
        if (error) {
            console.error('[Exercise save] Supabase error:', error);
            alert(`Egzersiz kaydedilemedi: ${error.message}`);
            return;
        }
        const oldData = existingId ? state.exercises.find(ex => ex.id == existingId) : null;
        window.pushToUndoLog(existingId ? 'UPDATE' : 'INSERT', 'master_egzersizler', oldData, newData, `Egzersiz: ${newData.ad}`);
        await sync();
        window.closeModal('modal-new-exercise');
    };

        window.loadPreviousMeasurement = () => {
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myM.length > 0) {
            const last = myM[0];
            const pMap = {
                'm-weight': last.weight, 'm-fat': last.fat, 'm-neck': last.neck, 'm-chest': last.chest,
                'm-waist': last.waist, 'm-basen': last.basen, 'm-l-onkol': last.sol_onkol, 'm-r-onkol': last.sag_onkol,
                'm-l-arm': last.l_arm, 'm-r-arm': last.r_arm, 'm-l-bacak': last.l_bacak, 'm-r-bacak': last.r_bacak,
                'm-l-kalf': last.l_kalf, 'm-r-kalf': last.r_kalf,
                'm-age': last.yas, 'm-rhr': last.rhr, 'm-cooper': last.cooper,
                'm-bmr': last.bmr, 'm-mhr': last.mhr, 'm-hrr': last.hrr, 'm-vo2max': last.vo2max
            };
            for(let id in pMap) {
                const el = document.getElementById(id);
                if(el && pMap[id] !== null && pMap[id] !== undefined) {
                    el.value = pMap[id];
                }
            }
        } else {
            alert("Önceki bir ölçüm bulunamadı.");
        }
    };


    window.openCardioModal = () => {
        document.getElementById('c-id').value = '';
        document.getElementById('c-modal-title').innerText = 'Yeni Test Al';
        const form = document.querySelector('#modal-cardio form');
        if (form) form.reset();

        const today = new Date();
        const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('c-date').value = dateString;

        const member = state.members.find(m => m.id == state.activeMemberId);
        if (member && member.boy) document.getElementById('c-height').value = member.boy;

        // Auto-fill weight from latest measurement if available
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myM.length > 0 && myM[0].weight) document.getElementById('c-weight').value = myM[0].weight;

        window.openModal('modal-cardio');
    };

    window.editCardioTest = (id) => {
        const m = state.measurements.find(x => x.id == id);
        if (!m) return;
        if (!m) return;
        document.getElementById('c-modal-title').innerText = 'Testi Düzenle';
        document.getElementById('c-id').value = m.id;
        document.getElementById('c-date').value = m.tarih;
        document.getElementById('c-weight').value = m.weight || '';
        const member = state.members.find(memb => memb.id == state.activeMemberId);
        document.getElementById('c-height').value = (member && member.boy) ? member.boy : '';
        document.getElementById('c-age').value = m.yas || '';
        document.getElementById('c-rhr').value = m.rhr || '';
        document.getElementById('c-cooper').value = m.cooper || '';
        document.getElementById('c-bmr').value = m.bmr || '';
        document.getElementById('c-mhr').value = m.mhr || '';
        document.getElementById('c-hrr').value = m.hrr || '';
        document.getElementById('c-vo2max').value = m.vo2max || '';
        window.openModal('modal-cardio');
    };

    window.saveCardioTest = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('c-id').value;
        const id = existingId || Date.now();
        // Check if there is an existing measurement on this date to merge, or create new
        const dateVal = document.getElementById('c-date').value;
        const datedMeasurement = state.measurements.find(x => x.member_id == state.activeMemberId && x.tarih == dateVal);
        let m = datedMeasurement;

        if (m) {
             m = { ...m, weight: parseFloat(document.getElementById('c-weight').value) || null };
             // VERY IMPORTANT: Strip out virtual frontend properties before sending to Supabase!
             delete m.yas; delete m.rhr; delete m.cooper;
             delete m.bmr; delete m.mhr; delete m.hrr; delete m.vo2max;
        } else {
             m = { id, member_id: state.activeMemberId, tarih: dateVal, weight: parseFloat(document.getElementById('c-weight').value) || null };
        }

        // Supabase schema strictness workaround:
        // We map the raw inputs into unused/legacy columns to avoid 400 Bad Request
        m.l_leg = parseFloat(document.getElementById('c-age').value) || null; // l_leg stores Age
        m.r_leg = parseFloat(document.getElementById('c-rhr').value) || null; // r_leg stores RHR
        m.hips = parseFloat(document.getElementById('c-cooper').value) || null; // hips stores Step Test HR

        const measurementResult = await dataService.mutate('olcumler', 'upsert', m);
        if (measurementResult.error) throw measurementResult.error;
        const oldData = existingId || datedMeasurement ? state.measurements.find(x => x.id == (existingId || datedMeasurement.id)) : null;
        window.pushToUndoLog(oldData ? 'UPDATE' : 'INSERT', 'olcumler', oldData, m, `Kardiyo Testi: ${m.tarih}`);
        await sync();
        e.target.reset();
        window.closeModal('modal-cardio');
        alert("Test kaydedildi!");
    };

    window.openMeasurementModal = () => {
        document.getElementById('m-id').value = '';
        document.getElementById('m-modal-title').innerText = 'Yeni Ölçüm Al';

        // Formu temizle ve bugünün tarihini at
        const form = document.querySelector('#modal-measurement form');
        if (form) form.reset();

        // En son ölçümü bul ve placeholderlara at
        const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        if (myM.length > 0) {
            const last = myM[0];
            const pMap = {
                'm-weight': last.weight, 'm-fat': last.fat, 'm-neck': last.neck, 'm-chest': last.chest,
                'm-waist': last.waist, 'm-basen': last.basen, 'm-l-onkol': last.sol_onkol, 'm-r-onkol': last.sag_onkol,
                'm-l-arm': last.l_arm, 'm-r-arm': last.r_arm, 'm-l-bacak': last.l_bacak, 'm-r-bacak': last.r_bacak,
                'm-l-kalf': last.l_kalf, 'm-r-kalf': last.r_kalf,
                'm-age': last.yas, 'm-rhr': last.rhr, 'm-cooper': last.cooper,
                'm-bmr': last.bmr, 'm-mhr': last.mhr, 'm-hrr': last.hrr, 'm-vo2max': last.vo2max
            };
            for(let id in pMap) {
                const el = document.getElementById(id);
                if(el) {
                    el.placeholder = pMap[id] ? `Son: ${pMap[id]}` : '';
                }
            }
        } else {
            const pMap = ['m-weight','m-fat','m-neck','m-chest','m-waist','m-basen','m-l-onkol','m-r-onkol','m-l-arm','m-r-arm','m-l-bacak','m-r-bacak','m-l-kalf','m-r-kalf'];
            pMap.forEach(id => {
                const el = document.getElementById(id);
                if(el) el.placeholder = '';
            });
        }

        // Tarih alanı için timezone offset düzeltmesiyle bugünü bul
        const today = new Date();
        const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('m-date').value = dateString;

        const member = state.members.find(m => m.id == state.activeMemberId);
        if (member && member.boy) {
            document.getElementById('m-height-measurement').value = member.boy;
        }

        window.openModal('modal-measurement');
    };



    window.calculateAdvancedMetrics = () => {
        const member = state.members.find(m => m.id == state.activeMemberId);
        const gender = member ? member.cinsiyet || 'Erkek' : 'Erkek';

        const weight = parseFloat(document.getElementById('c-weight').value);
        const height = parseFloat(document.getElementById('c-height').value);
        const age = parseFloat(document.getElementById('c-age').value);
        const rhr = parseFloat(document.getElementById('c-rhr').value);
        const cooperDistance = parseFloat(document.getElementById('c-cooper').value);

        // BMR Calculation (Mifflin-St Jeor Equation)
        if (weight && height && age) {
            let bmr = 0;
            if (gender === 'Kadın') {
                bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
            } else {
                bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
            }
            document.getElementById('c-bmr').value = Math.round(bmr);
        }

        // MHR and HRR (Tanaka formula for MHR)
        if (age) {
            const mhr = Math.round(208 - (0.7 * age));
            document.getElementById('c-mhr').value = mhr;

            if (rhr) {
                const hrr = mhr - rhr;
                document.getElementById('c-hrr').value = hrr;
            }
        }

        // VO2 Max (Queen's College Step Test Formula)
        if (cooperDistance) {
            let vo2max = 0;
            if (gender === 'Kadın') {
                vo2max = 65.81 - (0.1847 * cooperDistance);
            } else {
                vo2max = 111.33 - (0.42 * cooperDistance);
            }
            document.getElementById('c-vo2max').value = vo2max.toFixed(1);
        }
    };

    window.calculateFatPercentage = () => {
        const member = state.members.find(m => m.id == state.activeMemberId);
        const gender = member ? member.cinsiyet || 'Erkek' : 'Erkek';

        const weight = parseFloat(document.getElementById('m-weight').value);
        const height = parseFloat(document.getElementById('m-height-measurement').value);
        const waist = parseFloat(document.getElementById('m-waist').value);
        const neck = parseFloat(document.getElementById('m-neck').value);
        const hip = parseFloat(document.getElementById('m-basen').value); // only needed for females

        if (!height || !waist || !neck) return; // not enough data

        let fat = 0;
        // US Navy Body Fat Formula
        if (gender === 'Kadın') {
            if (!hip) return; // Females require hip measurement
            fat = 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(height) - 78.387;
        } else {
            fat = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
        }

        if (fat > 0 && fat < 100) {
            document.getElementById('m-fat').value = fat.toFixed(1);
        }
    };

window.editMeasurement = (id) => {
        const m = state.measurements.find(x => x.id == id);
        if (!m) return;
        const setField = (fieldId, value) => {
            const field = document.getElementById(fieldId);
            if (field) field.value = value ?? '';
        };
        document.getElementById('m-modal-title').innerText = 'Ölçümü Düzenle';
        setField('m-id', m.id);
        setField('m-date', m.tarih);
        setField('m-weight', m.weight);
        const member = state.members.find(memb => memb.id == state.activeMemberId);
        setField('m-height-measurement', member?.boy);
        setField('m-fat', m.fat);
        setField('m-waist', m.waist);
        setField('m-chest', m.chest);
        setField('m-neck', m.neck);
        setField('m-l-arm', m.l_arm);
        setField('m-r-arm', m.r_arm);
        setField('m-l-onkol', m.sol_onkol);
        setField('m-r-onkol', m.sag_onkol);
        setField('m-l-bacak', m.l_bacak);
        setField('m-r-bacak', m.r_bacak);
        setField('m-l-kalf', m.l_kalf);
        setField('m-r-kalf', m.r_kalf);
        setField('m-basen', m.basen);
        window.openModal('modal-measurement');
    };

    window.saveMeasurement = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('m-id').value;
        const id = existingId || Date.now();
        const dateVal = document.getElementById('m-date').value;
        let m = state.measurements.find(x => x.member_id == state.activeMemberId && x.tarih == dateVal);

        const freshData = {
            id,
            member_id: state.activeMemberId,
            tarih: dateVal,
            weight: parseFloat(document.getElementById('m-weight').value) || null,
            fat: parseFloat(document.getElementById('m-fat').value) || null,
            waist: parseFloat(document.getElementById('m-waist').value) || null,
            chest: parseFloat(document.getElementById('m-chest').value) || null,
            neck: parseFloat(document.getElementById('m-neck').value) || null,
            l_arm: parseFloat(document.getElementById('m-l-arm').value) || null,
            r_arm: parseFloat(document.getElementById('m-r-arm').value) || null,
            sol_onkol: parseFloat(document.getElementById('m-l-onkol').value) || null,
            sag_onkol: parseFloat(document.getElementById('m-r-onkol').value) || null,
            l_bacak: parseFloat(document.getElementById('m-l-bacak').value) || null,
            r_bacak: parseFloat(document.getElementById('m-r-bacak').value) || null,
            l_kalf: parseFloat(document.getElementById('m-l-kalf').value) || null,
            r_kalf: parseFloat(document.getElementById('m-r-kalf').value) || null,
            basen: parseFloat(document.getElementById('m-basen').value) || null
        };

        if (m) {
            m = { ...m, ...freshData };
            // VERY IMPORTANT: Strip out virtual frontend properties before sending to Supabase!
            delete m.yas; delete m.rhr; delete m.cooper;
            delete m.bmr; delete m.mhr; delete m.hrr; delete m.vo2max;
        } else {
            m = freshData;
        }

        const measurementResult = await dataService.mutate('olcumler', 'upsert', m);
        if (measurementResult.error) throw measurementResult.error;
        const oldData = existingId ? state.measurements.find(x => x.id == existingId) : null;
        window.pushToUndoLog(existingId ? 'UPDATE' : 'INSERT', 'olcumler', oldData, m, `Ölçüm: ${m.tarih}`);
        state.measurementRequired = false;
        await sync();
        e.target.reset();
        window.closeModal('modal-measurement');
        alert("Ölçüm kaydedildi!");
    };

    window.openWorkoutModal = () => {
        document.getElementById('w-name').value = '';
        document.getElementById('set-rows-container').innerHTML = '';

        // Tarih alanı için bugünü bul
        const today = new Date();
        const dateString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('w-date').value = dateString;

        const loader = document.getElementById('form-template-loader');
        if(loader) loader.value = '';

        window.openModal('modal-workout');
    };
    window.addSingleSet = (container, vals = {}) => {
        const setDiv = document.createElement('div');
        setDiv.className = 'single-set-row';
        setDiv.style.position = 'relative';
        setDiv.style.marginBottom = '0.4rem';
        setDiv.style.paddingBottom = '0.4rem';
        setDiv.style.borderBottom = '1px dashed rgba(255,255,255,0.1)';

        setDiv.innerHTML = `
            <div class="grid" style="grid-template-columns: 2fr 2fr 1.5fr 2fr 1.5fr; gap:0.5rem; align-items:end;">
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Ağırlık (kg)</label>
                    <input type="number" step="0.5" class="s-weight" required style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.weight || ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Tekrar</label>
                    <input type="number" class="s-reps" required style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.reps || ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Süre(sn)</label>
                    <input type="number" class="s-sure" style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.sure || ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Tip</label>
                    <select class="s-tip w-full" style="padding:0.4rem; font-size:0.75rem; border-radius:4px;">
                        <option value="Normal">Normal</option>
                        <option value="İzometrik">İzometrik</option>
                        <option value="Egzantrik">Egzantrik</option>
                        <option value="Dropset">Dropset</option>
                        <option value="Superset">Superset</option>
                        <option value="1RM">1RM</option>
                    </select>
                </div>
                <div class="form-group" style="margin:0; text-align:right; display:flex; justify-content:flex-end; gap:0.4rem;">
                    <button type="button" onclick="window.duplicateSet(this)" style="background:transparent; border:none; color:var(--primary-color, #4CAF50); font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Bu seti kopyala">⧉</button>
                    <button type="button" onclick="this.parentElement.parentElement.parentElement.remove()" style="background:transparent; border:none; color:#ff4444; font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Sil">×</button>
                </div>
            </div>
        `;
        container.appendChild(setDiv);

        // Eğer kopyalama işleminden (vals) tip değeri geldiyse onu seçili yap
        if (vals.tip) {
            setDiv.querySelector('.s-tip').value = vals.tip;
        }
    };

    // Kopyalama Butonunu Tetikleyen Fonksiyon
    window.duplicateSet = (btn) => {
        const row = btn.closest('.single-set-row');
        const container = row.parentElement;

        // Bulunduğu satırdaki mevcut değerleri al
        const vals = {
            weight: row.querySelector('.s-weight').value,
            reps: row.querySelector('.s-reps').value,
            sure: row.querySelector('.s-sure').value,
            tip: row.querySelector('.s-tip').value
        };

        // Aynı değerlerle yeni bir satır oluştur
        window.addSingleSet(container, vals);
    };
    window.addSetRowToWorkout = (exName = '') => {
        const container = document.getElementById('set-rows-container');
        const uniqueId = Date.now() + Math.random();

        const wrapper = document.createElement('div');
        wrapper.className = 'set-row-wrapper';
        wrapper.style.marginBottom = '1rem';
        wrapper.style.padding = '1rem';
        wrapper.style.background = 'rgba(255,255,255,0.02)';
        wrapper.style.borderRadius = '8px';
        wrapper.style.position = 'relative';

        wrapper.innerHTML = `
            <button type="button" class="btn-delete" onclick="this.parentElement.remove()" style="position:absolute; top:5px; right:5px; width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;">×</button>

            <div class="form-group" style="margin-bottom:0.8rem; padding-right: 30px;">
                <label style="display:block; margin-bottom:0.2rem; color:var(--text-dim); font-size:0.8rem;">Egzersiz</label>
                <select class="ex-select s-name w-full" required style="font-weight:bold;">
                    <option value="">Seç...</option>
                    ${state.exercises.map(ex => `<option value="${escapeHtml(ex.ad)}">${escapeHtml(ex.ad)}</option>`).join('')}
                </select>
            </div>

            <!-- İçine Setlerin Ekleneceği Alan -->
            <div class="sets-container" id="sets-${uniqueId}"></div>

            <button type="button" class="btn-secondary mt-1" style="font-size:0.75rem; padding:0.4rem; background:transparent; border:1px dashed var(--border); width:100%; color:var(--text-dim);" onclick="window.addSingleSet(this.previousElementSibling)">
                + Bu Harekete Set Ekle
            </button>
        `;

        container.appendChild(wrapper);

        if(exName) {
            const s = wrapper.querySelector('.s-name');
            s.value = exName;
        }

        // Blok oluşturulur oluşturulmaz varsayılan olarak 1. Seti içine ekle
        window.addSingleSet(wrapper.querySelector('.sets-container'));
    };

    window.saveWorkout = async (e) => {
        e.preventDefault();
        const setler = [];

        // 1. Ana egzersiz bloklarını dön
        document.querySelectorAll('.set-row-wrapper').forEach(wrapper => {
            const exName = wrapper.querySelector('.s-name').value;

            // 2. O egzersiz bloğunun içindeki TÜM set satırlarını bul ve sırayla ekle
            wrapper.querySelectorAll('.single-set-row').forEach((setRow, index) => {
                setler.push({
                    ad: exName,
                    set_no: index + 1, // Set numarasını 1, 2, 3 diye otomatik belirler
                    weight: setRow.querySelector('.s-weight').value,
                    reps: setRow.querySelector('.s-reps').value,
                    sure: setRow.querySelector('.s-sure').value,
                    tip: setRow.querySelector('.s-tip').value,
                    tempo: document.getElementById('w-tempo').value.trim(),
                    rest_seconds: Number(document.getElementById('w-rest').value) || 0,
                    rpe: Number(document.getElementById('w-rpe').value) || null
                });
            });
        });

        const w = {
            id: Date.now(),
            member_id: state.activeMemberId,
            tarih: document.getElementById('w-date').value,
            sablon: document.getElementById('w-name').value,
            setler: JSON.stringify(setler),
            status: 'completed',
            rpe: Number(document.getElementById('w-rpe').value) || null,
            tempo: document.getElementById('w-tempo').value.trim() || null,
            rest_seconds: Number(document.getElementById('w-rest').value) || 0
        };

        const workoutResult = await dataService.mutate('antrenmanlar', 'upsert', w);
        if (workoutResult.error) throw workoutResult.error;
        window.pushToUndoLog('INSERT', 'antrenmanlar', null, w, `Antrenman Kaydedildi: ${w.sablon}`);
        await sync();
        window.closeModal('modal-workout');
        alert("Antrenman kaydedildi!");
    };

    window.startWorkoutSession = async (activityType = 'traditional_strength') => {
        if (!state.activeMemberId) throw new Error('Aktif üye seçilmedi.');
        const session = {
            id: Date.now(),
            member_id: state.activeMemberId,
            source: 'trainer_pro',
            activity_type: activityType,
            status: 'active',
            started_at: new Date().toISOString(),
            metadata: { appVersion: APP_VERSION }
        };
        const result = await dataService.mutate('workout_sessions', 'upsert', session);
        if (result.error) throw result.error;
        state.activeWorkoutSession = session;
        return session;
    };

    window.finishWorkoutSession = async (summary = {}) => {
        const session = state.activeWorkoutSession;
        if (!session) throw new Error('Aktif antrenman oturumu bulunamadı.');
        const completed = {
            ...session,
            status: 'completed',
            ended_at: new Date().toISOString(),
            active_energy_kcal: summary.activeEnergyKcal ?? null,
            average_heart_rate: summary.averageHeartRate ?? null,
            maximum_heart_rate: summary.maximumHeartRate ?? null,
            metadata: { ...session.metadata, ...summary }
        };
        const result = await dataService.mutate('workout_sessions', 'upsert', completed);
        if (result.error) throw result.error;
        state.activeWorkoutSession = null;
        return completed;
    };

    window.saveWorkoutSessionStep = async (step) => {
        const session = state.activeWorkoutSession;
        if (!session) throw new Error('Aktif antrenman oturumu bulunamadı.');
        const payload = {
            id: step.id || Date.now(),
            workout_session_id: session.id,
            exercise_name: step.exerciseName,
            step_index: step.stepIndex,
            sets: step.sets ?? null,
            reps: step.reps ?? null,
            weight: step.weight ?? null,
            duration_seconds: step.durationSeconds ?? null,
            tempo: step.tempo ?? null,
            rest_seconds: step.restSeconds ?? 0,
            rpe: step.rpe ?? null,
            completed: step.completed ?? false,
            completed_at: step.completed ? new Date().toISOString() : null
        };
        const result = await dataService.mutate('workout_session_steps', 'upsert', payload, {
            onConflict: 'workout_session_id,step_index'
        });
        if (result.error) throw result.error;
        return payload;
    };

    window.addExerciseRowToTemplate = (name = '') => {
        const container = document.getElementById('p-exercise-rows');
        const div = document.createElement('div');
        div.className = 'set-row-wrapper';
        div.innerHTML = `
            <div class="set-row">
                <select class="p-ex-name" required>
                    <option value="">Egzersiz Seç...</option>
                    ${state.exercises.map(ex => `<option value="${escapeHtml(ex.ad)}" ${ex.ad === name ? 'selected' : ''}>${escapeHtml(ex.ad)}</option>`).join('')}
                </select>
                <button type="button" class="btn-delete" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        container.appendChild(div);
    };

    window.handleProgramSubmit = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('edit-program-id').value;
        const id = existingId || Date.now();
        const name = document.getElementById('p-name').value;
        const details = [];
        document.querySelectorAll('.p-ex-name').forEach(sel => {
            if (sel.value) details.push({ ad: sel.value });
        });

        const p = { id, program_adi: name, detaylar: JSON.stringify(details) };
        const oldData = existingId ? state.programs.find(prog => prog.id == existingId) : null;

        const programResult = await dataService.mutate('programlar', 'upsert', p);
        if (programResult.error) throw programResult.error;
        window.pushToUndoLog(existingId ? 'UPDATE' : 'INSERT', 'programlar', oldData, p, `Şablon: ${name}`);

        await sync();
        window.closeModal('modal-program');
        alert("Şablon kaydedildi!");
    };

    window.showProgramDetail = (id) => {
        try {
            const p = state.programs.find(x => x.id == id);
            if (!p) return;
            const details = window.safeJSONParse(p.detaylar, []);
            document.getElementById('detail-title').innerText = p.program_adi;
            document.getElementById('detail-body').innerHTML = `
                <ul class="m-list">
                    ${details.map(d => `<li>💪 ${escapeHtml(d.ad)}</li>`).join('')}
                </ul>
                <button class="btn-primary mt-1 w-full" onclick="window.loadProgramToWorkout(${p.id})">Bu Programı Başlat</button>
            `;
            window.openModal('modal-detail');
        } catch (err) { console.error(err); }
    };

    window.loadProgramToWorkout = (id) => {
        const p = state.programs.find(x => x.id == id);
        if (!p) return;
        window.closeModal('modal-detail');
        if (!state.activeMemberId) {
            alert("Lütfen önce bir üye seçin.");
            window.nav('members-view');
            return;
        }
        window.tab('workouts');
        document.getElementById('w-name').value = p.program_adi;
        document.getElementById('set-rows-container').innerHTML = '';
        const details = window.safeJSONParse(p.detaylar, []);
        details.forEach(d => window.addSetRowToWorkout(d.ad));
    };
    window.loadTemplateToForm = (programAdiVeyaId) => {
        // Boş seçim yapıldıysa durdur
        if (!programAdiVeyaId) return;

        // Şablonu state.programs içinden bul (Dropdown'dan id veya isim gelme ihtimaline karşı ikisini de kontrol ediyoruz)
        const p = state.programs.find(x => x.id == programAdiVeyaId || x.program_adi == programAdiVeyaId);
        if (!p) {
            console.error("Şablon bulunamadı:", programAdiVeyaId);
            return;
        }

        // 1. Antrenman adını forma yaz
        document.getElementById('w-name').value = p.program_adi;

        // 2. Önceki hareketleri temizle
        document.getElementById('set-rows-container').innerHTML = '';

        // 3. Şablon detaylarını (JSON) parse et ve her bir hareket için yeni satır oluştur
        const details = window.safeJSONParse(p.detaylar, []);

        // Üyenin geçmiş antrenmanlarını performans tahmini için al
        const myW = state.workouts.filter(w => w.member_id == state.activeMemberId).sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));

        details.forEach(d => {
            // Egzersizi ekle
            window.addSetRowToWorkout(d.ad);

            // Eğer geçmişte bu hareketi yapmışsa, placeholder eklemek için DOM elementlerini bul
            let lastWeight = '';
            let lastReps = '';

            for (let w of myW) {
                const sets = window.safeJSONParse(w.setler, []);
                const match = sets.find(s => s.ad === d.ad);
                if (match) {
                    lastWeight = match.weight;
                    lastReps = match.reps;
                    break;
                }
            }

            if (lastWeight || lastReps) {
                // DOM'a yeni eklenen en son wrapper'ı bul
                const containers = document.querySelectorAll('.set-row-wrapper');
                const lastContainer = containers[containers.length - 1];
                if (lastContainer) {
                    const weightInput = lastContainer.querySelector('.s-weight');
                    const repsInput = lastContainer.querySelector('.s-reps');
                    if (weightInput) weightInput.placeholder = lastWeight ? `Son: ${lastWeight}` : '';
                    if (repsInput) repsInput.placeholder = lastReps ? `Son: ${lastReps}` : '';

                    // Küçük bir ipucu metni de ekleyelim
                    const hint = document.createElement('div');
                    hint.style.fontSize = '0.7rem';
                    hint.style.color = 'var(--accent)';
                    hint.style.marginTop = '0.3rem';
                    hint.innerText = `💡 Son Performans: ${lastWeight}kg x ${lastReps}`;
                    lastContainer.appendChild(hint);
                }
            }
        });
    };

    window.editProgram = (id) => {
        const p = state.programs.find(x => x.id == id);
        if (!p) return;
        document.getElementById('edit-program-id').value = p.id;
        document.getElementById('p-name').value = p.program_adi;
        document.getElementById('p-exercise-rows').innerHTML = '';
        const details = window.safeJSONParse(p.detaylar, []);
        details.forEach(d => window.addExerciseRowToTemplate(d.ad));
        window.openModal('modal-program');
    };

        window.showMeasurementDetail = (id) => {
        try {
            const myM = state.measurements.filter(m => m.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
            const idx = myM.findIndex(x => x.id == id);
            if (idx === -1) return;
            const m = myM[idx];
            const prev = (idx < myM.length - 1) ? myM[idx + 1] : null;

            document.getElementById('detail-title').innerText = `${new Date(m.tarih).toLocaleDateString('tr-TR')} Ölçüm Detayları`;

            // Calculate advanced metrics
            const member = state.members.find(x => x.id == state.activeMemberId);
            let advancedHtml = '';

            // Kardiyo ve Metabolizma Analizi
            let cardioHtml = '';
            if (m.bmr || m.vo2max || m.rhr) {
                cardioHtml = `
                    <div style="margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1);">
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent);">🫀 Kardiyo & Metabolizma</h4>
                        <div class="grid" style="grid-template-columns: 1fr 1fr; gap:0.5rem;">
                            ${m.bmr ? `<div class="stat-card"><span>BMR (Bazal Met.)</span><h3>${m.bmr} kcal</h3></div>` : ''}
                            ${m.vo2max ? `<div class="stat-card"><span>VO2 Max</span><h3>${m.vo2max}</h3></div>` : ''}
                            ${m.rhr ? `<div class="stat-card"><span>RHR (Dinlenik)</span><h3>${m.rhr} bpm</h3></div>` : ''}
                            ${m.hrr ? `<div class="stat-card"><span>HRR (Rezerv)</span><h3>${m.hrr} bpm</h3></div>` : ''}
                        </div>
                    </div>`;
            }

            if (m.weight && m.fat) {
                const fatMass = (m.weight * (m.fat / 100)).toFixed(1);
                const lbm = (m.weight - fatMass).toFixed(1);
                let bmiHtml = '';
                if (member && member.boy) {
                    const heightM = member.boy / 100;
                    const bmi = (m.weight / (heightM * heightM)).toFixed(1);
                    let bmiStatus = bmi < 18.5 ? "Zayıf" : (bmi < 25 ? "Normal" : (bmi < 30 ? "Fazla Kilolu" : "Obez"));
                    bmiHtml = `<div class="stat-card" style="grid-column: span 2; background: rgba(var(--accent-rgb), 0.1); border: 1px solid var(--accent);"><span>BMI (Vücut Kitle İndeksi)</span><h3 style="color:var(--accent);">${bmi} <small>(${bmiStatus})</small></h3></div>`;
                }

                advancedHtml = `
                    <div style="margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1);">
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent);">📊 Analiz</h4>
                        <div class="grid" style="grid-template-columns: 1fr 1fr; gap:0.5rem;">
                            ${bmiHtml}
                            <div class="stat-card"><span>Yağ Kütlesi</span><h3>${fatMass} kg</h3></div>
                            <div class="stat-card"><span>Yağsız Kütle (LBM)</span><h3>${lbm} kg</h3></div>
                        </div>
                    </div>`;
            }

            // Render symmetry analysis for limbs
            let symmetryHtml = '';
            const symPairs = [
                { name: 'Kol', l: m.l_arm, r: m.r_arm },
                { name: 'Önkol', l: m.sol_onkol, r: m.sag_onkol },
                { name: 'Bacak', l: m.l_bacak, r: m.r_bacak },
                { name: 'Kalf', l: m.l_kalf, r: m.r_kalf }
            ];
            const asymmetries = symPairs.filter(p => p.l && p.r && Math.abs(p.l - p.r) > 0.5).map(p => {
                const diff = Math.abs(p.l - p.r).toFixed(1);
                const larger = p.l > p.r ? 'Sol' : 'Sağ';
                return `<li>${larger} ${p.name} <b>${diff}cm</b> daha büyük</li>`;
            });

            if (asymmetries.length > 0) {
                symmetryHtml = `
                    <div style="margin-top:1rem; padding: 1rem; background: rgba(255,165,0,0.1); border: 1px solid orange; border-radius: 8px;">
                        <h4 style="color: orange; margin-bottom: 0.5rem;">⚠️ Simetri Analizi (>0.5cm)</h4>
                        <ul style="margin:0; padding-left: 1rem; font-size:0.9rem; color: var(--text);">${asymmetries.join('')}</ul>
                    </div>`;
            }

            const fields = MEASUREMENT_FIELDS;
            let gridHtml = `<div class="grid" style="grid-template-columns: 1fr 1fr;">`;
            fields.forEach(field => {
                const value = m[field.key];
                const delta = getMeasurementDelta(m, prev, field.key);
                gridHtml += `<div class="stat-card">
                    <span style="display:flex; justify-content:space-between; align-items:center;">
                        ${field.label}
                        <span class="measurement-delta ${getDeltaClass(delta, field.direction)}">${formatDelta(delta, field.unit)}</span>
                    </span>
                    <h3>${value ?? '--'} ${field.unit}</h3>
                </div>`;
            });
            gridHtml += `</div>`;

            document.getElementById('detail-body').innerHTML = advancedHtml + cardioHtml + gridHtml + symmetryHtml;
            window.openModal('modal-detail');
        } catch (err) { console.error(err); }
    };

  window.showWorkoutDetail = (id) => {
    try {
        // state.workouts veya state.antrenmanlar içinden tıklanan antrenmanı bul
        const w = state.workouts.find(x => x.id == id) || (state.antrenmanlar && state.antrenmanlar.find(x => x.id == id));
        if (!w) return;

        const setler = window.safeJSONParse(w.setler, []);

        // 1. Gelen tüm setleri egzersiz adına (ad) göre grupla
        const groupedSets = {};
        setler.forEach(s => {
            const egzersizAdi = s.ad || "İsimsiz Egzersiz";
            if (!groupedSets[egzersizAdi]) {
                groupedSets[egzersizAdi] = [];
            }
            groupedSets[egzersizAdi].push(s);
        });

        // 2. Başlığı modal içine yazdır
        document.getElementById('detail-title').innerText = `${w.sablon || 'Serbest Antrenman'} - ${new Date(w.tarih).toLocaleDateString('tr-TR')}`;

        // 3. Gruplanmış verileri profesyonel bir kart/tablo yapısına dönüştür
        let html = '<div class="workout-summary-container">';

        for (const [egzersizAdi, sets] of Object.entries(groupedSets)) {
            html += `
            <div class="exercise-group" style="margin-bottom: 1.2rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                <div style="background: rgba(255,255,255,0.03); padding: 0.7rem 1rem; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text);">
                    💪 ${escapeHtml(egzersizAdi)}
                </div>
                <div style="padding: 0.5rem 1rem;">
                    <table style="width: 100%; font-size: 0.85rem; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="color: var(--text-dim); border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="padding: 0.4rem 0; width: 15%;">Set</th>
                                <th style="padding: 0.4rem 0; width: 30%;">Ağırlık</th>
                                <th style="padding: 0.4rem 0; width: 25%;">Tekrar</th>
                                <th style="padding: 0.4rem 0; width: 30%;">Ekstra</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            sets.forEach((s, index) => {
                const setNo = s.set_no || (index + 1);
                const tipBadge = (s.tip && s.tip !== 'Normal') ? `<span style="background:var(--primary-color, #4CAF50); color:#000; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:bold;">${escapeHtml(s.tip)}</span>` : '';
                const sureText = s.sure ? `<span style="color:var(--text-dim); font-size:0.75rem; margin-left: 4px;">⏱️ ${escapeHtml(s.sure)}s</span>` : '';

                html += `
                            <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                                <td style="padding: 0.5rem 0; color: var(--text-dim);">${escapeHtml(setNo)}</td>
                                <td style="padding: 0.5rem 0; font-weight: bold; color: #fff;">${escapeHtml(s.weight || '-')} kg</td>
                                <td style="padding: 0.5rem 0; font-weight: bold; color: #fff;">${escapeHtml(s.reps || '-')}</td>
                                <td style="padding: 0.5rem 0;">${tipBadge}${sureText}</td>
                            </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
        }

        html += '</div>';

        // Modalın içine bas ve modalı aç
        document.getElementById('detail-body').innerHTML = html;
        window.openModal('modal-detail');

    } catch (err) {
        console.error("Antrenman detayı açılırken hata:", err);
    }
};

    // --- DELETES ---
    window.deleteWorkout = async (id) => { if (confirm("Silinsin mi?")) { const oldData = state.workouts.find(w => w.id == id); const result = await dataService.mutate('antrenmanlar', 'delete', null, { id }); if (result.error) throw result.error; window.pushToUndoLog('DELETE', 'antrenmanlar', oldData, null, `Antrenman Silindi: ${oldData.sablon}`); await sync(); } };
    window.deleteMeasurement = async (id) => { if (confirm("Silinsin mi?")) { const oldData = state.measurements.find(m => m.id == id); const result = await dataService.mutate('olcumler', 'delete', null, { id }); if (result.error) throw result.error; window.pushToUndoLog('DELETE', 'olcumler', oldData, null, `Ölçüm Silindi`); await sync(); } };
    window.deleteExercise = async (id) => { if (confirm("Silinsin mi?")) { const oldData = state.exercises.find(e => e.id == id); const result = await dataService.mutate('master_egzersizler', 'delete', null, { id }); if (result.error) throw result.error; window.pushToUndoLog('DELETE', 'master_egzersizler', oldData, null, `Egzersiz Silindi: ${oldData.ad}`); await sync(); } };
    window.deleteProgram = async (id) => { if (confirm("Silinsin mi?")) { const oldData = state.programs.find(p => p.id == id); const result = await dataService.mutate('programlar', 'delete', null, { id }); if (result.error) throw result.error; window.pushToUndoLog('DELETE', 'programlar', oldData, null, `Şablon Silindi: ${oldData.program_adi}`); await sync(); } };
    window.deleteMember = async (id) => { if (confirm("Bu üyeyi silmek istediğinize emin misiniz?")) { const oldData = state.members.find(m => m.id == id); const result = await dataService.mutate('uyeler', 'delete', null, { id }); if (result.error) throw result.error; window.pushToUndoLog('DELETE', 'uyeler', oldData, null, `Üye Silindi: ${oldData.ad_soyad}`); await sync(); } };

    // --- DOCUMENTS ---

    window.scanStorageForDocs = async () => {
        if (!state.activeMemberId) return;
        try {
            const { data, error } = await supabase.storage.from('dokumanlar').list(state.activeMemberId.toString());
            if (error) return { data: null, error: error };
            state.cloudFiles = data || [];
            renderDocuments();
        } catch (err) { handleError(err, 'ScanStorage'); }
    };

    window.deleteOnlyCloudDoc = async (path) => {
        if (!confirm("Buluttan silinsin mi?")) return;
        try {
            const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
            await supabase.storage.from('dokumanlar').remove([encodedPath]);
            await window.scanStorageForDocs();
        } catch (e) { console.error(e); }
    };

    window.viewDocument = async (path) => {
        const win = window.open('', '_blank');
        try {
            const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
            const { data, error } = await supabase.storage.from('dokumanlar').createSignedUrl(encodedPath, 60);
            if (data?.signedUrl) win.location.href = data.signedUrl;
            else { if(win) win.close(); alert("Hata: Dosya bulunamadı"); }
        } catch (e) { if(win) win.close(); }
    };

    window.uploadDocument = async (e) => {
        e.preventDefault();
        if (!navigator.onLine) {
            alert('Belge yüklemek için internet bağlantısı gereklidir. Diğer değişiklikler çevrimdışı kuyruğa alınabilir.');
            return;
        }
        const file = document.getElementById('doc-file').files[0];
        const name = document.getElementById('doc-name').value;
        const type = document.getElementById('doc-type').value;
        const trMap = {'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'};
        const cleanFileName = file.name.replace(/[çÇğĞıİöÖşŞüÜ]/g, m => trMap[m]).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        const filePath = `${state.activeMemberId}/${Date.now()}_${cleanFileName}`;
        try {
            const { error: uploadError } = await supabase.storage.from('dokumanlar').upload(filePath, file);
            if (uploadError) throw uploadError;
            const newData = { member_id: state.activeMemberId, adi: name, yol: filePath, tip: type };
            const { data, error: dbError } = await supabase.from('dokumanlar').insert(newData).select();
            if (dbError) throw dbError;
            window.pushToUndoLog('INSERT', 'dokumanlar', null, data[0], `Döküman Yüklendi: ${name}`);
            await sync();
            alert("Döküman yüklendi!");
            e.target.reset();
        } catch (err) { alert("Hata: " + err.message); }
    };

    window.deleteDocument = async (id, path) => {
        if (!confirm("Döküman silinsin mi?")) return;
        try {
            const oldData = state.documents.find(d => d.id == id);
            const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
            await supabase.from('dokumanlar').delete().eq('id', id);
            await supabase.storage.from('dokumanlar').remove([encodedPath]);
            window.pushToUndoLog('DELETE', 'dokumanlar', oldData, null, `Döküman Silindi: ${oldData.adi}`);
            await sync();
        } catch (e) { handleError(e, "DeleteDoc"); }
    };

    // --- MEMBER PROFILE SYNC ---

    window.openProfile = (id) => {
        state.activeMemberId = id;
        const m = state.members.find(x => x.id == id);
        if (m) {
            document.getElementById('prof-name').innerText = m.ad_soyad;
            const meta = document.getElementById('prof-meta');
            if (meta) {
                const details = [m.brans, m.cinsiyet].filter(Boolean);
                const schedule = state.schedules.filter(item => item.member_id == id)
                    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                    .map(item => `${getScheduleDayName(item.day_of_week)} ${item.start_time.slice(0, 5)}`);
                if (schedule.length) details.push(`Program: ${schedule.join(', ')}`);
                meta.innerText = details.length ? details.join(' · ') : 'Profil detaylarını ve gelişimi yönetin.';
            }
        }

        const myM = state.measurements.filter(m => m.member_id == id).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        const now = new Date();
        let needsMeasurement = false;

        if (myM.length === 0) {
            needsMeasurement = true;
        } else {
            const lastDate = new Date(myM[0].tarih);
            const diffTime = now.getTime() - lastDate.getTime();
            const diffDays = diffTime / (1000 * 3600 * 24);

            // Rolling Guard: Tam olarak 30 gün geçtiyse zorunlu kıl.
            if (diffDays >= 30) {
                needsMeasurement = true;
            }
        }

        if (needsMeasurement) {
            state.measurementRequired = true;
            alert("📅 Bu ay için ölçümünüz eksik! Lütfen devam etmeden önce güncel ölçümlerinizi girin.");
            window.nav('profile-view'); window.tab('measurements');
        } else {
            state.measurementRequired = false;
            window.nav('profile-view'); window.tab('analytics');
        }
        window.scanStorageForDocs();
    };

    window.editActiveMember = () => {
        if (state.activeMemberId) window.editMember(state.activeMemberId);
    };

    window.performGlobalSearch = () => {
        const keyword = document.getElementById('global-search-keyword').value.toLowerCase();
        if (!keyword) { window.nav(state.navHistory[state.navHistory.length - 2] || 'members-view'); return; }
        window.nav('search-results-view', false);
        const container = document.getElementById('search-results-content');
        container.innerHTML = '';
        const includeMembers = document.getElementById('f-cat-members').checked;
        const includeProgs = document.getElementById('f-cat-progs').checked;
        const includeWorkouts = document.getElementById('f-cat-workouts').checked;
        const exCheckbox = document.getElementById('f-cat-exercises');
        const includeExercises = exCheckbox ? exCheckbox.checked : true;
        const foodsCheckbox = document.getElementById('f-cat-foods');
        const includeFoods = foodsCheckbox ? foodsCheckbox.checked : true;

        let results = [];
        if (includeMembers) state.members.filter(m => m.ad_soyad.toLowerCase().includes(keyword) || m.brans.toLowerCase().includes(keyword)).forEach(m => results.push({ type: 'Member', data: m }));
        if (includeProgs) state.programs.filter(p => p.program_adi.toLowerCase().includes(keyword)).forEach(p => results.push({ type: 'Program', data: p }));
        if (includeWorkouts) state.workouts.filter(w => w.sablon.toLowerCase().includes(keyword)).forEach(w => results.push({ type: 'Workout', data: w }));

        if (includeExercises) {
            state.exercises.filter(ex => {
                const g = window.safeJSONParse(ex.gruplar, {});
                const searchString = `${ex.ad} ${g.bodyPart || ''} ${(g.muscles || []).join(' ')} ${g.branch || ex.brans || ''}`.toLowerCase();
                return searchString.includes(keyword);
            }).forEach(ex => results.push({ type: 'Exercise', data: ex }));
        }

        if (includeFoods) {
            state.foods.filter(f => {
                const searchString = `${f.ad} ${f.tip || ''}`.toLowerCase();
                return searchString.includes(keyword);
            }).forEach(f => results.push({ type: 'Food', data: f }));
        }

        const totalCount = results.length;
        results = results.slice(0, 100);

        if (results.length === 0) { container.innerHTML = '<div class="no-results">Eşleşen sonuç bulunamadı.</div>'; return; }

        let html = `<div class="grid">${results.map(r => {
            if (r.type === 'Member') return `<div class="card" onclick="window.openProfile(${r.data.id})"><h3>👤 ${escapeHtml(r.data.ad_soyad)}</h3><p>${escapeHtml(r.data.brans)}</p></div>`;
            if (r.type === 'Program') return `<div class="card" onclick="window.showProgramDetail(${r.data.id})"><h3>📋 ${escapeHtml(r.data.program_adi)}</h3></div>`;
            if (r.type === 'Workout') return `<div class="card" onclick="window.showWorkoutDetail(${r.data.id})"><h3>🏋️ ${escapeHtml(r.data.sablon)}</h3><p>${new Date(r.data.tarih).toLocaleDateString('tr-TR')}</p></div>`;
            if (r.type === 'Exercise') {
                const g = window.safeJSONParse(r.data.gruplar, {});
                return `<div class="card" onclick="window.editExercise(${r.data.id})"><h3>💪 ${escapeHtml(r.data.ad)}</h3><p>${escapeHtml(g.bodyPart || '')} ${g.muscles ? '- ' + escapeHtml(g.muscles.join(', ')) : ''}</p></div>`;
            }
            if (r.type === 'Food') {
                return `<div class="card" onclick="window.editFood(${r.data.id})"><h3>🍏 ${escapeHtml(r.data.ad)}</h3><p>${escapeHtml(r.data.tip || 'Yemek')} - 🔥 ${escapeHtml(r.data.kalori)} kcal</p></div>`;
            }
        }).join('')}</div>`;

        if (totalCount > 100) {
            html += `<div style="text-align:center; padding:1rem; color:var(--text-dim); font-size:0.8rem; grid-column: 1 / -1;">⚠️ Çok fazla sonuç bulundu (${totalCount}). Sadece ilk 100 sonuç gösteriliyor. Lütfen aramanızı daraltın.</div>`;
        }

        container.innerHTML = html;
    };

    // --- SYNC & INITIALIZATION ---

    // --- OFFLINE & LOCAL STORAGE CACHING ---
    function saveToLocal() {
        try {
            const stateToSave = {
                members: state.members,
                programs: state.programs,
                measurements: state.measurements,
                workouts: state.workouts,
                documents: state.documents,
                schedules: state.schedules,
                exercises: state.exercises,
                foods: state.foods,
                diets: state.diets,
                healthMetrics: state.healthMetrics,
                workoutSessions: state.workoutSessions,
                deviceConnections: state.deviceConnections,
                lastSync: new Date().getTime()
            };
            localStorage.setItem('trainerpro_cache', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn("Yerel depolama hatası (Kota aşımı vb.):", e);
        }
    }

    function loadFromLocal() {
        try {
            const cached = localStorage.getItem('trainerpro_cache');
            if (cached) {
                const data = JSON.parse(cached);
                state.members = data.members || [];
                state.programs = data.programs || [];
                state.measurements = data.measurements || [];
                state.workouts = data.workouts || [];
                state.documents = data.documents || [];
                state.schedules = data.schedules || [];
                state.exercises = data.exercises || [];
                state.foods = data.foods || [];
                state.diets = data.diets || [];
                state.healthMetrics = data.healthMetrics || [];
                state.workoutSessions = data.workoutSessions || [];
                state.deviceConnections = data.deviceConnections || [];
                return true;
            }
        } catch (e) {
            console.warn("Yerel depolama okuma hatası:", e);
        }
        return false;
    }

    async function sync() {
        const { data: sessionData } = await withAuthTimeout(
            supabase.auth.getSession(),
            'Oturum kontrolü zaman aşımına uğradı.'
        );
        if (!sessionData.session) {
            setSyncStatus('offline', 'Yönetici girişi bekleniyor');
            return false;
        }
        if (!navigator.onLine) {
            const hasLocal = loadFromLocal();
            if(hasLocal) refreshAll();
            setSyncStatus('offline', 'Çevrimdışı (Son Önbellek Kullanılıyor)');
            return false;
        }

        // Önce hızlıca ekranı doldur (Optimistic UI)
        loadFromLocal();
        refreshAll();

        setSyncStatus('syncing', 'Senkronize ediliyor...');
        try {

            const results = await Promise.all([
                supabase.from('uyeler').select('*'),
                supabase.from('programlar').select('*'),
                supabase.from('olcumler').select('*'),
                supabase.from('antrenmanlar').select('*'),
                supabase.from('dokumanlar').select('*'),
                supabase.from('weekly_program_schedule').select('*'),
                dataService.fetchAll('master_egzersizler').then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                dataService.fetchAll('master_besinler').then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                supabase.from('beslenme_planlari').select('*'),
                supabase.from('health_metrics').select('*'),
                supabase.from('workout_sessions').select('*'),
                supabase.from('device_connections').select('*')
            ]);




            const errIndex = results.findIndex(r => r.error);
            if (errIndex !== -1) {
                console.error("Supabase Error Data:", results[errIndex].error);
                throw new Error("Veritabanı hatası at index " + errIndex + ": " + results[errIndex].error.message);
            }

            state.members = results[0].data || [];
            state.programs = results[1].data || [];
                        state.measurements = (results[2].data || []).map(m => {
                // Restore test values from legacy columns
                m.yas = m.l_leg;
                m.rhr = m.r_leg;
                m.cooper = m.hips;

                // Recalculate derived metrics (BMR, MHR, HRR, VO2) so they exist in state for the dashboard
                if (m.yas) {
                    m.mhr = Math.round(208 - (0.7 * m.yas));
                    if (m.rhr) m.hrr = m.mhr - m.rhr;
                }

                if (m.cooper) {
                    const member = results[0].data.find(x => x.id == m.member_id);
                    const gender = member ? member.cinsiyet || 'Erkek' : 'Erkek';
                    if (gender === 'Kadın') {
                        m.vo2max = (65.81 - (0.1847 * m.cooper)).toFixed(1);
                    } else {
                        m.vo2max = (111.33 - (0.42 * m.cooper)).toFixed(1);
                    }
                }

                if (m.weight && m.yas) {
                    const member = results[0].data.find(x => x.id == m.member_id);
                    if (member && member.boy) {
                        const gender = member.cinsiyet || 'Erkek';
                        let bmr = 0;
                        if (gender === 'Kadın') {
                            bmr = (10 * m.weight) + (6.25 * member.boy) - (5 * m.yas) - 161;
                        } else {
                            bmr = (10 * m.weight) + (6.25 * member.boy) - (5 * m.yas) + 5;
                        }
                        m.bmr = Math.round(bmr);
                    }
                }

                return m;
            });
            state.workouts = results[3].data || [];
            state.documents = results[4].data || [];
            state.schedules = results[5].data || [];
            state.exercises = results[6].data || [];
            state.foods = results[7].data || [];
            state.diets = results[8].data || [];
            state.healthMetrics = results[9].data || [];
            state.workoutSessions = results[10].data || [];
            state.deviceConnections = results[11].data || [];


            refreshAll();
            setSyncStatus('online', 'Senkronize edildi');
            window.setTimeout(() => {
                if (navigator.onLine) setSyncStatus('online', 'Çevrimiçi');
            }, 1800);
            return true;
        } catch (error) {
            console.error("SYNC CATCH BLOCK:", error);
            setSyncStatus('error', 'Senkronizasyon başarısız · Yeniden deneniyor');
            scheduleRealtimeReconnect();
            return false;
        }
    }

    function scheduleRealtimeSync(reason = 'database-change') {
        window.clearTimeout(realtimeSyncTimer);
        realtimeSyncTimer = window.setTimeout(() => {
            sync().catch(error => handleError(error, `Realtime sync (${reason})`));
        }, 300);
    }

    function scheduleRealtimeReconnect() {
        if (realtimeReconnectTimer) return;
        realtimeReconnectTimer = window.setTimeout(() => {
            realtimeReconnectTimer = null;
            subscribeToRealtime();
        }, 5000);
    }

    function subscribeToRealtime() {
        if (realtimeChannel) return;

        const channel = supabase.channel('trainer-pro-live-sync');
        REALTIME_TABLES.forEach(table => {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                payload => {
                    console.info(`[Realtime] ${payload.eventType} ${table}`);
                    scheduleRealtimeSync(`${table}:${payload.eventType}`);
                }
            );
        });

        realtimeChannel = channel;
        channel.subscribe((status, error) => {
            // Ignore events from a channel we already released (logout, or replaced after a drop).
            if (realtimeChannel !== channel) return;
            if (status === 'SUBSCRIBED') {
                console.info('[Realtime] Live sync connected');
                return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.error('[Realtime] Live sync disconnected', { status, error });
                realtimeChannel = null;
                supabase.removeChannel(channel);
                scheduleRealtimeReconnect();
            }
        });
    }

    window.sync = sync;

    let initialized = false;
    async function init() {
        if (initialized) return;
        initialized = true;
        await sync();
        subscribeToRealtime();

        window.addEventListener('online', () => {
            setSyncStatus('syncing', 'Bağlantı geri geldi · Senkronize ediliyor...');
            subscribeToRealtime();
            scheduleRealtimeSync('browser-online');
        });
        window.addEventListener('offline', () => {
            setSyncStatus('offline', 'Çevrimdışı · Son veriler gösteriliyor');
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                subscribeToRealtime();
                scheduleRealtimeSync('page-visible');
            }
        });

        // Setup fab (floating action button)
        const fab = document.createElement('button');
        fab.className = 'fab';
        fab.innerHTML = '➕';
        fab.onclick = () => state.activeMemberId ? window.tab('measurements') : window.openModal('modal-member');
        document.body.appendChild(fab);
    }

});
