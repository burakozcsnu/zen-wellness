/**
 * Zen Wellness Club - Yönetici SPA
 * Optimized for Batoner Mobile App Studios Standards
 * Version 1.3.86 - Modal Workout Edition
 */

 document.addEventListener('DOMContentLoaded', () => {
    // --- CACHE BUSTER ---
    const APP_VERSION = '1.3.128';
    const vTag = document.getElementById('version-tag');
    if (vTag) vTag.textContent = `v${APP_VERSION} - Zen Wellness Club`;

    window.showToast = (message, type = 'info') => {
        let region = document.getElementById('toast-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'toast-region';
            region.className = 'toast-region';
            document.body.appendChild(region);
        }
        if ([...region.children].some(toast => toast.textContent === message)) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        toast.addEventListener('click', () => toast.remove());
        setTimeout(() => toast.remove(), type === 'error' ? 6000 : 4000);
        region.appendChild(toast);
        while (region.children.length > 3) region.firstChild.remove();
    };

    // Nothing is sent to a server: the error stays in the console and the user sees a short message.
    const reportUnexpectedError = error => {
        console.error(error);
        window.showToast('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    };
    window.addEventListener('error', event => {
        if (event.target !== window) return; // failed image/script loads are not code errors
        if (String(event.message).includes('ResizeObserver loop')) return;
        reportUnexpectedError(event.error || event.message);
    });
    window.addEventListener('unhandledrejection', event => reportUnexpectedError(event.reason));
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
            showAuthError(trMessage(error));
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
    // Turkish text for errors that come from Supabase or the browser (English). Our own plain Error()s are already Turkish.
    const TR_ERRORS = [
        [/invalid login credentials/i, 'E-posta veya şifre hatalı.'],
        [/email not confirmed/i, 'E-posta adresiniz henüz doğrulanmamış.'],
        [/already registered|already been registered/i, 'Bu e-posta adresiyle zaten bir hesap var.'],
        [/password should be at least|weak password/i, 'Şifre çok kısa veya zayıf.'],
        [/rate limit|too many requests|over_.*_rate_limit/i, 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.'],
        [/failed to fetch|networkerror|network request failed|load failed/i, 'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.'],
        [/jwt|refresh token|not authenticated|session/i, 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.'],
        [/permission denied|row-level security|not allowed|notallowederror/i, 'Bu işlem için yetkiniz yok.'],
        [/push service|registration failed|subscribe/i, 'Bildirim kaydı yapılamadı. Lütfen tekrar deneyin.']
    ];
    const trMessage = (error) => {
        const message = error?.message || String(error || '');
        if (error instanceof Error && error.constructor === Error) return message;
        return TR_ERRORS.find(([pattern]) => pattern.test(`${error?.name || ''} ${message}`))?.[1]
            || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
    };
    const showAuthError = (message) => {
        const errorElement = document.getElementById('auth-error');
        if (errorElement) errorElement.textContent = message;
    };
    // iPhone Safari has no install prompt: explain Add to Home Screen once, never when already installed or on other devices.
    function showIosInstallHint() {
        const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (!isIos || navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches || document.getElementById('ios-hint')) return;
        try { if (localStorage.getItem('ios_hint_dismissed')) return; } catch { /* storage blocked: show the hint every time */ }
        const card = document.createElement('div');
        card.id = 'ios-hint';
        card.className = 'ios-hint';
        card.setAttribute('role', 'status');
        const text = document.createElement('span');
        text.textContent = 'Uygulamayı ana ekrana ekleyin: Paylaş simgesine, sonra "Ana Ekrana Ekle"ye dokunun.';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = 'Tamam';
        ok.addEventListener('click', () => {
            try { localStorage.setItem('ios_hint_dismissed', '1'); } catch { /* storage blocked: the card only closes */ }
            card.remove();
        });
        card.append(text, ok);
        document.body.appendChild(card);
    }
    const enterAdminPortal = () => {
        state.navHistory = ['members-view'];
        document.body.classList.add('portal-entered');
        document.getElementById('brand-splash')?.classList.add('is-hidden');
        showIosInstallHint();
        init();
    };
    let activeMemberPortalMemberId = null;
    let activeMemberPortalTab = 'overview';
    let portalTabTrail = []; // tabs visited before the current one, for the back button
    let memberPortalData = null; // last portal data as loaded or cached; unsent changes are laid over it at render time
    const enterMemberPortal = () => {
        document.body.classList.add('member-portal-active');
        document.getElementById('brand-splash')?.classList.add('is-hidden');
        document.getElementById('app-wrapper')?.setAttribute('hidden', '');
        document.getElementById('member-portal')?.removeAttribute('hidden');
        portalTabTrail = [];
        showIosInstallHint();
        loadMemberPortal();
    };
    const createScheduleNotification = async ({ memberId, scheduleId = null, action, message }) => {
        const { error } = await dataService.mutate('schedule_notifications', 'insert', {
            id: window.TrainerProDataService.newId(),
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
        state.navHistory = ['members-view'];
        portalTabTrail = [];
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
        memberPortalData = null;
        releaseMemberSession();
        // Logged sets are personal data: nothing of the last user stays in memory for the next one.
        state.workoutSessions = [];
        state.attendance = [];
        state.sessionSteps = [];
        state.activeWorkoutSession = null;
        savedStepIds.clear();
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
        VAPID_PUBLIC_KEY: 'BJx6pZl_kYFxXZZ28NRlP0XPEjUwwvlCn2tal2DblY_EMxopkxxA1TfL4SYlvIiAuSsB61qkctZ99jtk4L5mQPE'
    };

    // Weak gym signal must end in "queued", not in a frozen button. Uploads (storage) may legitimately take longer.
    const timedFetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        const own = init.signal || (typeof input === 'object' && input.signal);
        if (own || url.includes('/storage/v1/') || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return fetch(input, init);
        return fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
    };
    const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { global: { fetch: timedFetch } });
    let currentUserId = null; // kept in step with the login so refreshAll can stay synchronous
    const dataService = window.TrainerProDataService.create(supabase);
    // Whole-table (or one member's) read in pages: the API caps one response at 1,000 rows. Same { data, error } shape as supabase.from().select().
    const loadAll = (table, filters) => dataService.fetchAll(table, 1000, filters)
        .then(data => ({ data, error: null })).catch(error => ({ data: null, error }));
    // Steps of the 30 most recent sessions (they have no member_id). A failed read gives null plus a toast, never a blank screen.
    const loadSessionSteps = async (sessions) => {
        const ids = [...sessions].sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, 30).map(session => session.id);
        const result = await loadAll('workout_session_steps', { workout_session_id: ids });
        if (result.error) {
            handleError(result.error, 'Session steps load');
            showToast('Set kayıtları yüklenemedi.', 'error');
            return null;
        }
        return result.data || [];
    };
    window.addEventListener('trainerpro-sync-queue', event => {
        const pending = event.detail?.pending || 0;
        if (event.detail?.queued) showToast('Bağlantı yok. Değişiklik cihazda bekliyor; bağlantı gelince gönderilecek.', 'info');
        if (pending > 0) setSyncStatus('syncing', `${pending} değişiklik gönderilmeyi bekliyor`);
        else if (navigator.onLine) {
            setSyncStatus('online', 'Senkronize edildi');
            // A client must never go through the trainer's loader.
            (document.body.classList.contains('member-portal-active') ? loadMemberPortal() : sync())
                .catch(error => handleError(error, 'Queued sync refresh'));
        }
    });
    // An offline change failed for good (kept in localStorage 'trainerpro_sync_failed').
    window.addEventListener('trainerpro-sync-failed', event => {
        if (memberPortalData && document.body.classList.contains('member-portal-active')) showMemberPortal(memberPortalData, currentUserId); // drop the tick of a change that was dropped
        if (event.detail?.failed?.length) showToast('Bir değişiklik kaydedilemedi. Ayrıntılar için bekleyen değişiklikler listesine bakın.', 'error');
    });
    window.addEventListener('trainerpro-sync-auth', () => showToast('Oturum süresi doldu. Değişiklikleriniz cihazda bekliyor; lütfen tekrar giriş yapın.', 'error'));
    supabase.auth.onAuthStateChange((event, session) => {
        currentUserId = session?.user?.id || null;
        window.setTimeout(renderSyncPending, 0); // login and logout; deferred so the function below is defined
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
            // Not a chosen logout (wrong role, expired session): drop the cache but keep the queue, the same person normally logs in again.
            localStorage.removeItem('trainerpro_cache');
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
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id || null;
            const pending = userId ? dataService.getPendingCount(userId) : 0;
            if (pending > 0 && !confirm(`Gönderilmemiş ${pending} değişiklik var. Çıkış yaparsanız bu değişiklikler silinir. Yine de çıkış yapılsın mı?`)) return;
            let clearFailed = false;
            try {
                dataService.clearLocalData(userId);
            } catch (clearError) {
                handleError(clearError, 'Clear local data');
                clearFailed = true;
                showToast('Cihazdaki veriler silinemedi. Lütfen tarayıcı verilerini elle temizleyin.', 'error');
            }
            let signOutError = null;
            try {
                ({ error: signOutError } = await withAuthTimeout(
                    supabase.auth.signOut(),
                    'Çıkış işlemi zaman aşımına uğradı.'
                ));
            } catch (error) {
                signOutError = error;
            }
            if (signOutError) {
                handleError(signOutError, 'Admin logout');
                // The server call failed (no connection), so the session is removed from this device only.
                localStorage.removeItem(supabase.auth.storageKey);
                // The reload would wipe the toast, so let it be read first.
                if (clearFailed) await new Promise(resolve => setTimeout(resolve, 2000));
                window.location.reload();
                return;
            }
            exitAdminPortal();
        } catch (error) {
            handleError(error, 'Admin logout');
            showToast('Çıkış yapılamadı. Lütfen tekrar deneyin.', 'error');
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
                workoutSessions: state.workoutSessions.filter(item => item.member_id === memberId),
                sessionSteps: state.sessionSteps.filter(step => state.workoutSessions.some(item => item.id == step.workout_session_id && item.member_id === memberId))
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
            showToast('Veriler dışa aktarılamadı. Lütfen tekrar deneyin.', 'error');
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
                showAuthError(trMessage(error));
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
            showAuthError(trMessage(error));
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    };

    let state = {
        members: [], exercises: [], programs: [], measurements: [], workouts: [], documents: [], schedules: [], cloudFiles: [],
        foods: [], diets: [], healthMetrics: [], workoutSessions: [], sessionSteps: [], deviceConnections: [], attendance: [],
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
            icon: 'icons/icon-192.png'
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
        const serverKey = decodeVapidKey(CONFIG.VAPID_PUBLIC_KEY);
        let existing = await registration.pushManager.getSubscription();
        // A subscription made with an older VAPID key can never receive pushes; replace it.
        const existingKey = existing?.options?.applicationServerKey;
        if (existing && existingKey) {
            const bytes = new Uint8Array(existingKey);
            const sameKey = bytes.length === serverKey.length && bytes.every((byte, index) => byte === serverKey[index]);
            if (!sameKey) {
                await existing.unsubscribe();
                existing = null;
            }
        }
        const subscription = existing || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: serverKey
        });
        const { endpoint, keys } = subscription.toJSON();
        const { error } = await dataService.mutate('push_subscriptions', 'upsert', {
            id: window.TrainerProDataService.newId(),
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
            if (status) status.textContent = trMessage(error);
            return;
        }
        if (status) {
            await updateMemberNotificationStatus(true);
        }
    };

    window.sendTestNotification = async () => {
        const registration = await navigator.serviceWorker.getRegistration('./');
        if (!registration) {
            showToast('Push servisi henüz kurulmamış. Önce bildirimleri etkinleştirin.', 'error');
            return;
        }
        await registration.showNotification('Zen Wellness Club test bildirimi', {
            body: 'iPhone push bildirimi başarıyla çalışıyor.',
            icon: 'icons/icon-192.png',
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
            showToast(`Bildirimler kapatılamadı: ${trMessage(error)}`, 'error');
        }
    };

    const renderMemberPortal = ({ member, measurements, workouts, diets, documents, schedules, deliveries, notifications = [], attendance = [], completions = [], workoutSessions = [], sessionSteps = [], pushEnabled }) => {
        state.workoutSessions = workoutSessions; // the export and later screens read these, with unsent changes laid over
        state.sessionSteps = sessionSteps;
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
        const todayDate = window.TrainerProDataService.localDate();
        const planSetText = set => {
            const first = window.TrainerProExerciseDomain.planSets([set])[0];
            return first ? window.TrainerProExerciseDomain.formatSet(first.targetWeight, first.targetReps, first.targetSeconds) : '';
        };
        const dailyExercises = sortedWorkouts.flatMap(workout => {
            const sets = window.safeJSONParse(workout.setler, []);
            return sets.map((set, index) => ({ workout, set, index }));
        });
        const exerciseMarkup = dailyExercises.length ? dailyExercises.map(({ workout, set, index }) => {
            const key = `${workout.id}:${index}:${todayDate}`;
            const completed = completionByKey.get(key);
            return `<li class="member-exercise-item">
                <span><strong>${escapePortalText(set.ad || 'Egzersiz')}</strong><small>${escapePortalText(workout.sablon || 'Antrenman')} · ${escapePortalText(planSetText(set))}</small></span>
                <button class="btn-secondary" type="button" onclick="window.toggleWorkoutExercise(${workout.id}, ${index}, ${completed ? 'false' : 'true'})">${completed ? 'Tamamlandı ✓' : 'Tamamla'}</button>
            </li>`;
        }).join('') : '<p class="member-portal-muted">Bugün için egzersiz listesi bulunmuyor.</p>';
        const nextOccurrenceDate = day => {
            const today = new Date();
            const todayDay = today.getDay() || 7;
            const offset = (Number(day) - todayDay + 7) % 7;
            today.setDate(today.getDate() + offset);
            return window.TrainerProDataService.localDate(today);
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
                <h2>Haftalık programım</h2>
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
                <h2>Bildirim Merkezi</h2>
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
                    <h2 style="margin-bottom:1rem; color:var(--accent);">Vücut Ölçümleri & Analiz</h2>

                    <div class="member-portal-grid" style="margin-bottom: 1.5rem; background:rgba(255,255,255,0.02); padding:1rem; border-radius:12px;">
                        ${metrics.map(([label, value, unit]) => `
                            <div><span class="member-portal-muted">${label}</span><h3>${escapePortalText(value)} ${unit}</h3></div>
                        `).join('')}
                    </div>

                    <h3 style="margin-bottom:1rem; font-size:1rem; color:var(--primary);">Kardiyo ve Metabolizma (Son Test)</h3>
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
                    <h3 style="margin:1.5rem 0 1rem; font-size:1rem; color:var(--primary);">⌚ Akıllı Saat Verileri</h3>
                    ${(() => {
                        // Read-only. Latest value per metric_type; shows an empty state until the Watch pilot (S1-S5) sends data.
                        const latest = new Map();
                        (state.healthMetrics || []).forEach(item => {
                            const current = latest.get(item.metric_type);
                            if (!current || new Date(item.recorded_at) > new Date(current.recorded_at)) latest.set(item.metric_type, item);
                        });
                        if (!latest.size) return '<p class="member-portal-muted">Akıllı saat verileriniz bağlandığında burada görünecek.</p>';
                        return `<div class="member-portal-grid" style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:12px;">${[...latest.values()].map(item => `
                            <div><span class="member-portal-muted">${escapePortalText(item.metric_type)}</span><h3>${escapePortalText(item.value)} ${escapePortalText(item.unit)}</h3>
                            <span class="member-portal-muted">${escapePortalText(new Date(item.recorded_at).toLocaleDateString('tr-TR'))}</span></div>`).join('')}</div>`;
                    })()}
                </section>

                <section class="member-portal-card member-portal-section" data-portal-section="workouts">
                    <h2 style="margin-bottom:1rem; color:var(--accent);">Günlük egzersizler</h2>
                    <ul class="member-portal-list member-exercise-list">${exerciseMarkup}</ul>
                    <h3 style="margin:1rem 0 0.75rem;">Antrenman geçmişi</h3>
                    ${sortedWorkouts.length ? `<ul class="member-portal-list">${sortedWorkouts.slice(0, 10).map(workout => `
                        <li style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; margin-bottom:0.5rem; border:1px solid rgba(255,255,255,0.05);">
                            <strong>${escapePortalText(workout.sablon || 'Antrenman')}</strong><br>
                            <span class="member-portal-muted">${escapePortalText(workout.tarih)}</span>
                            ${window.TrainerProExerciseDomain.planSets(workout.setler).length
                                ? `<br><button class="btn-secondary session-start" type="button" data-session-start="${workout.id}" onclick="window.startMemberSession(${workout.id})">${activeSessionFor(workout.id, workoutSessions) ? 'Devam Et' : 'Antrenmanı Başlat'}</button>`
                                : '<br><span class="member-portal-muted">Bu antrenmanda egzersiz yok.</span>'}
                        </li>
                    `).join('')}</ul>` : '<p class="member-portal-muted">Henüz antrenman kaydı bulunmuyor.</p>'}
                </section>

                <section class="member-portal-card member-portal-section" data-portal-section="nutrition">
                    <h2 style="margin-bottom:1rem; color:var(--accent);">Beslenme planları</h2>
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
                                <span style="background:rgba(255,165,0,0.1); color:orange; padding:0.2rem 0.5rem; border-radius:4px;">${tCal.toFixed(0)} kcal</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">P: ${tPro.toFixed(0)}g</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">C: ${tCarb.toFixed(0)}g</span>
                                <span style="background:rgba(143,183,217,0.1); color:var(--primary); padding:0.2rem 0.5rem; border-radius:4px;">Y: ${tFat.toFixed(0)}g</span>
                            </div>
                        </li>`;
                    }).join('')}</ul>` : '<p class="member-portal-muted">Henüz beslenme planı bulunmuyor.</p>'}
                </section>
                <section class="member-portal-card member-portal-section" data-portal-section="documents">
                    <h2>Belgeler</h2>
                    ${documents.length ? `<ul class="member-portal-list">${documents.map(document => `
                        <li><strong>${escapePortalText(document.adi || 'Belge')}</strong><br>
                        <span class="member-portal-muted">${escapePortalText(document.tip)}</span></li>
                    `).join('')}</ul>` : '<p class="member-portal-muted">Henüz belge bulunmuyor.</p>'}
                </section>
            </div>`;
        window.selectMemberPortalTab(isSameMember ? activeMemberPortalTab : 'overview');
        startMemberNotifications(member, sortedSchedules, pushEnabled);
        renderMemberSession(); // an open session screen follows the new data (a queue flush reloads the portal)
    };

    // Renders the portal with this user's unsent changes laid over the data; the data itself stays as loaded.
    const showMemberPortal = (data, userId) => {
        memberPortalData = data;
        const pending = dataService.getPending(userId);
        const lay = (rows, table) => window.TrainerProDataService.applyPending(rows, table, pending);
        renderMemberPortal({
            ...data,
            member: lay([data.member], 'uyeler')[0] || data.member,
            measurements: lay(data.measurements, 'olcumler'),
            attendance: lay(data.attendance, 'schedule_attendance'),
            completions: lay(data.completions, 'workout_completions'),
            workoutSessions: lay(data.workoutSessions || [], 'workout_sessions'),
            sessionSteps: lay(data.sessionSteps || [], 'workout_session_steps')
        });
    };
    // A queued change shows at once from the data in hand; a sent one reloads from the server.
    const reloadMemberPortal = (queued) => (queued && memberPortalData
        ? Promise.resolve(showMemberPortal(memberPortalData, currentUserId))
        : loadMemberPortal());
    const memberCacheTime = (lastSync) => new Date(lastSync).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const showCachedMemberPortal = (userId, status) => {
        let cache = null;
        try {
            cache = JSON.parse(localStorage.getItem('trainerpro_cache') || 'null');
        } catch (e) {
            console.warn('Yerel depolama okuma hatası:', e);
        }
        const usable = cache?.role === 'member' && cache.portal && cache.userId === userId && Date.now() - cache.lastSync < 14 * 864e5;
        if (!usable) {
            if (cache?.role === 'member') localStorage.removeItem('trainerpro_cache'); // another user's or 14-day-old health data
            if (status) status.textContent = 'Bağlantı yok ve bu cihazda kayıtlı veri bulunmuyor.';
            return;
        }
        showMemberPortal(cache.portal, userId);
        if (status) status.textContent = `Çevrimdışı · Son güncelleme: ${memberCacheTime(cache.lastSync)}`;
    };

    window.toggleScheduleAttendance = async (scheduleId, occurrenceDate, status) => {
        if (!activeMemberPortalMemberId) return;
        const { error, queued } = await dataService.mutate('schedule_attendance', 'upsert', {
            id: window.TrainerProDataService.newId(),
            member_id: activeMemberPortalMemberId,
            schedule_id: scheduleId,
            occurrence_date: occurrenceDate,
            status,
            updated_at: new Date().toISOString()
        }, { onConflict: 'member_id,schedule_id,occurrence_date' });
        if (error) {
            handleError(error, 'Schedule attendance');
            showToast(`Katılım durumu kaydedilemedi: ${trMessage(error)}`, 'error');
            return;
        }
        await reloadMemberPortal(queued);
    };

    window.toggleWorkoutExercise = async (workoutId, exerciseIndex, completed) => {
        if (!activeMemberPortalMemberId) return;
        const { error, queued } = await dataService.mutate('workout_completions', 'upsert', {
            id: window.TrainerProDataService.newId(),
            member_id: activeMemberPortalMemberId,
            workout_id: workoutId,
            exercise_index: exerciseIndex,
            completion_date: window.TrainerProDataService.localDate(),
            completed,
            updated_at: new Date().toISOString()
        }, { onConflict: 'member_id,workout_id,exercise_index,completion_date' });
        if (error) {
            handleError(error, 'Workout completion');
            showToast(`Egzersiz durumu kaydedilemedi: ${trMessage(error)}`, 'error');
            return;
        }
        await reloadMemberPortal(queued);
    };

    window.selectMemberPortalTab = (tab, fromBack = false) => {
        if (!fromBack && tab !== activeMemberPortalTab) portalTabTrail.push(activeMemberPortalTab);
        activeMemberPortalTab = tab;
        document.querySelectorAll('[data-portal-section]').forEach(section => {
            section.hidden = section.dataset.portalSection !== tab;
        });
        document.querySelectorAll('[data-portal-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.portalTab === tab);
        });
    };

    // DRAFT consent text: must be reviewed by a lawyer (roadmap L1) before real clients see it.
    // Bump CONSENT_VERSION whenever the wording changes; the version is saved with every receipt.
    const CONSENT_VERSION = 'taslak-1';
    const CONSENT_TITLE = 'Kişisel Verilerin İşlenmesi ve Açık Rıza (TASLAK)';
    const CONSENT_TEXT = [
        'Zen Wellness Club olarak, antrenman ve beslenme hizmetini size göre hazırlamak amacıyla sağlık geçmişiniz, alerjileriniz, boyunuz ve kilonuz gibi özel nitelikli kişisel verilerinizi işleyeceğiz.',
        'Verileriniz yalnızca size atanan antrenör tarafından görülür. Veriler, hizmet sağlayıcımız aracılığıyla yurt dışındaki (Almanya) sunucularda saklanır ve 6698 sayılı KVKK kapsamında korunur.',
        'Açık rızanızı istediğiniz zaman geri çekebilir ve verilerinizin silinmesini talep edebilirsiniz.'
    ];

    const assessmentQuestions = [
        { key: 'kvkk_riza', title: CONSENT_TITLE, type: 'consent', required: true },
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
        if (question.type === 'consent') {
            control = `
                <div class="assessment-consent">${CONSENT_TEXT.map(paragraph => `<p>${escapePortalText(paragraph)}</p>`).join('')}</div>
                <label class="assessment-option assessment-consent-check">
                    <input id="assessment-consent" type="checkbox" ${value?.accepted ? 'checked' : ''}>
                    <span>Okudum, anladım ve sağlık verilerimin işlenmesine açık rızam var.</span>
                </label>`;
        } else if (question.type === 'body') {
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
        if (question.type === 'consent') {
            if (!document.getElementById('assessment-consent')?.checked) return false;
            state.assessmentAnswers[question.key] = { accepted: true, version: CONSENT_VERSION };
            return true;
        }
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

    // Saves the consent receipt as a text file in the client's own documents folder + a dokumanlar row.
    // Runs BEFORE any health data is saved; returns an error message or null.
    const saveConsentReceipt = async (member, answers) => {
        if (state.assessmentConsentSaved === member.id) return null;
        if (!navigator.onLine) return 'Rızanızı kaydetmek için internet bağlantısı gereklidir.';
        const acceptedAt = new Date().toISOString();
        const receipt = [
            'ZEN WELLNESS CLUB - KVKK AÇIK RIZA KAYDI',
            `Metin sürümü: ${CONSENT_VERSION}`,
            `Üye: ${answers.ad_soyad || member.ad_soyad} (${member.id})`,
            `Onay tarihi (UTC): ${acceptedAt}`,
            '',
            CONSENT_TITLE,
            ...CONSENT_TEXT
        ].join('\n');
        const filePath = `${member.id}/kvkk_riza_${Date.now()}.txt`;
        const { error: uploadError } = await supabase.storage.from('dokumanlar')
            .upload(filePath, new Blob([receipt], { type: 'text/plain;charset=utf-8' }), { contentType: 'text/plain;charset=utf-8' });
        if (uploadError) { handleError(uploadError, 'Consent receipt upload'); return 'Rıza kaydı oluşturulamadı. Lütfen tekrar deneyin.'; }
        const { error: dbError } = await supabase.from('dokumanlar')
            .insert({ member_id: member.id, adi: 'KVKK Açık Rıza Kaydı', yol: filePath, tip: 'KVKK' });
        if (dbError) { handleError(dbError, 'Consent receipt row'); return 'Rıza kaydı oluşturulamadı. Lütfen tekrar deneyin.'; }
        state.assessmentConsentSaved = member.id;
        answers.kvkk_riza = { accepted: true, version: CONSENT_VERSION, accepted_at: acceptedAt };
        return null;
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
        const consentError = await saveConsentReceipt(member, answers);
        if (consentError) {
            if (error) error.textContent = consentError;
            return;
        }
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
            id: window.TrainerProDataService.newId(),
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
        let userId = null;
        try {
            // Offline with a known user: skip getSession(), which cannot answer once the token has expired without a connection.
            if (!navigator.onLine && currentUserId) return showCachedMemberPortal(currentUserId, status);
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session) throw new Error('Oturum bulunamadı.');
            userId = sessionData.session.user.id;
            // Önce sadece member'i çekip ID'sini bulmalıyız
            const memberResult = await supabase.from('uyeler').select('*').eq('auth_user_id', userId).maybeSingle();
            if (memberResult.error) throw memberResult.error;
            const member = memberResult.data;
            if (!member) throw new Error('Bu kullanıcı henüz aktif bir danışan profiline bağlanmamış. Lütfen antrenörünüzden sizi sisteme dahil etmesini isteyin.');

            // Sonra o member'in ID'siyle güvenli bir şekilde filtreleyerek sadece ONUN verilerini çek
            const [measurementsResult, workoutsResult, dietsResult, documentsResult, schedulesResult, pushResult, deliveriesResult, notificationsResult, attendanceResult, completionsResult, healthMetricsResult, workoutSessionsResult] = await Promise.all([
                loadAll('olcumler', { member_id: member.id }),
                loadAll('antrenmanlar', { member_id: member.id }),
                loadAll('beslenme_planlari', { member_id: member.id }),
                loadAll('dokumanlar', { member_id: member.id }),
                loadAll('weekly_program_schedule', { member_id: member.id }),
                supabase.from('push_subscriptions').select('id,endpoint').eq('member_id', member.id),
                supabase.from('push_reminder_deliveries').select('id,subscription_id,schedule_id,reminder_type,delivered_at').order('delivered_at', { ascending: false }).limit(50),
                supabase.from('schedule_notifications').select('id,schedule_id,action,message,created_at,read_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(50),
                loadAll('schedule_attendance', { member_id: member.id }),
                loadAll('workout_completions', { member_id: member.id }),
                loadAll('health_metrics', { member_id: member.id }),
                loadAll('workout_sessions', { member_id: member.id })
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
            state.sessionSteps = (await loadSessionSteps(state.workoutSessions)) || [];

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

            const portal = {
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
                workoutSessions: state.workoutSessions,
                sessionSteps: state.sessionSteps,
                pushEnabled: (pushResult.data || []).length > 0
            };
            showMemberPortal(portal, userId);
            // No device copy before the KVKK questionnaire is completed: the cached portal has no questionnaire.
            if (member.degerlendirme_tamamlandi) {
                try {
                    localStorage.setItem('trainerpro_cache', JSON.stringify({ userId, role: 'member', lastSync: Date.now(), portal }));
                } catch (e) {
                    console.warn('Yerel depolama hatası (Kota aşımı vb.):', e);
                }
            }
            if (!member.degerlendirme_tamamlandi) window.showMemberAssessment(member);
            if (status) status.textContent = 'Salt okunur danışan paneli';
        } catch (error) {
            if (userId && /Failed to fetch|Load failed|NetworkError|AbortError|TimeoutError|signal timed out|aborted/i.test(error?.message || String(error))) {
                return showCachedMemberPortal(userId, status);
            }
            handleError(error, 'Member portal load');
            if (status) status.textContent = `Panel yüklenemedi: ${trMessage(error)}`;
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
        'workout_sessions',
        'workout_session_steps'
    ];

    const MEASUREMENT_FIELDS = [
        { key: 'weight', label: 'Kilo', unit: 'kg', direction: 'down-good' },
        { key: 'fat', label: 'Yağ Oranı', unit: '%', direction: 'down-good', better: 'lower' },
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

    const showOfflineStatus = (lastSync) => {
        const waiting = dataService.getPendingCount(currentUserId);
        const base = lastSync
            ? `Çevrimdışı · Son güncelleme: ${new Date(lastSync).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
            : 'Çevrimdışı · Bu cihazda kayıtlı veri yok';
        setSyncStatus('offline', waiting ? `${base} · ${waiting} değişiklik gönderilmeyi bekliyor` : base);
    };

    // --- Waiting / failed changes: button and list ---
    const SYNC_TABLES = { uyeler: 'Danışan', olcumler: 'Ölçüm', antrenmanlar: 'Antrenman', beslenme_planlari: 'Beslenme planı', weekly_program_schedule: 'Haftalık program', master_egzersizler: 'Egzersiz', master_besinler: 'Besin', programlar: 'Program', workout_completions: 'Egzersiz işareti', schedule_attendance: 'Katılım', push_subscriptions: 'Bildirim aboneliği', schedule_notifications: 'Bildirim', workout_sessions: 'Antrenman oturumu', workout_session_steps: 'Set', dokumanlar: 'Belge' };
    const SYNC_OPERATIONS = { upsert: 'Kayıt', insert: 'Kayıt', update: 'Güncelleme', delete: 'Silme' };
    const renderSyncPending = () => {
        const pending = currentUserId ? dataService.getPending(currentUserId) : [];
        const failed = currentUserId ? dataService.getFailed(currentUserId) : [];
        const button = document.getElementById('sync-pending-button');
        const total = pending.length + failed.length;
        if (button) {
            button.hidden = total === 0;
            button.textContent = String(total);
            button.setAttribute('aria-label', `Bekleyen değişiklikler (${total})`);
        }
        const list = document.getElementById('sync-list');
        if (!list || document.getElementById('modal-sync').style.display !== 'block') return;
        const row = (item, failedItem) => {
            const div = document.createElement('div');
            div.className = 'sync-row';
            const text = document.createElement('span');
            text.className = 'sync-row-text';
            const time = new Date(item.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            text.textContent = `${SYNC_TABLES[item.table] || item.table} · ${SYNC_OPERATIONS[item.operation] || item.operation} · ${time}`;
            div.appendChild(text);
            if (failedItem) {
                const reason = document.createElement('small');
                reason.className = 'sync-row-reason';
                reason.textContent = item.status === 'conflict' ? 'Bu kayıt başka bir cihazda değiştirilmiş.' : trMessage(item.lastError);
                text.appendChild(reason);
                for (const [label, action] of [...(item.status === 'conflict' ? [] : [['Tekrar dene', () => dataService.retryFailed(item.queueId)]]), ['Sil', () => { if (window.confirm('Bu değişiklik kalıcı olarak silinsin mi?')) dataService.discardFailed(item.queueId); }]]) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.addEventListener('click', () => { action(); renderSyncPending(); });
                    div.appendChild(b);
                }
            }
            return div;
        };
        const section = (title, items, failedItems) => {
            if (!items.length) return;
            const h = document.createElement('h3');
            h.textContent = title;
            list.append(h, ...items.map(item => row(item, failedItems)));
        };
        list.replaceChildren();
        section('Gönderilmeyi bekleyenler', pending, false);
        section('Kaydedilemeyenler', failed, true);
        if (!total) {
            const empty = document.createElement('p');
            empty.textContent = 'Bekleyen değişiklik yok.';
            list.appendChild(empty);
        }
    };
    document.getElementById('sync-pending-button')?.addEventListener('click', () => { window.openModal('modal-sync'); renderSyncPending(); });
    for (const name of ['trainerpro-sync-queue', 'trainerpro-sync-failed']) window.addEventListener(name, renderSyncPending);

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
        const wasOpen = el.style.display === 'block';
        el.style.display = 'block';
        el.setAttribute('aria-hidden', 'false');
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        const heading = el.querySelector('h1, h2, h3');
        if (heading) {
            if (!heading.id) heading.id = `${id}-heading`;
            el.setAttribute('aria-labelledby', heading.id);
        }
        if (wasOpen) return;
        el._opener = document.activeElement;
        const first = modalFocusables(el).find(c => !c.classList.contains('close')) || heading;
        if (first) { if (first === heading) heading.tabIndex = -1; first.focus(); }
    };

    const modalFocusables = el => [...el.querySelectorAll('button, input, [href], select, textarea, [tabindex]')]
        .filter(c => !c.disabled && c.tabIndex >= 0 && c.getClientRects().length);
    const topOpenModal = () => [...document.querySelectorAll('.modal')].reverse().find(m => m.style.display === 'block');

    // Tab wraps inside the top modal, Escape closes it like its close button; close spans act as buttons.
    document.addEventListener('keydown', event => {
        const modal = topOpenModal();
        if (!modal || event.isComposing) return; // IME composition uses Escape/Tab itself
        const close = event.target.closest?.('.modal .close');
        if (close && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); close.click(); return; }
        if (event.key === 'Escape') { event.preventDefault(); window.closeModal(modal.id); return; }
        if (event.key !== 'Tab') return;
        const items = modalFocusables(modal);
        if (!items.length) return;
        const at = items.indexOf(document.activeElement);
        const target = event.shiftKey ? (at <= 0 ? items[items.length - 1] : null) : (at === -1 || at === items.length - 1 ? items[0] : null);
        if (target) { event.preventDefault(); target.focus(); }
    });

    window.closeModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
        const opener = el._opener;
        el._opener = null;
        if (opener && document.contains(opener)) opener.focus();
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
        if(fab) fab.classList.add('is-busy');

        try {
            const actions = state.undoStack.slice(0, index + 1);

            for (const action of actions) {
                // INSERT edilen veriyi veritabanından SIL (Geri al)
                if (action.type === 'INSERT') {
                    if (action.newData && action.newData.id) {
                        const { error } = await supabase.from(action.table).delete().eq('id', action.newData.id);
                        if (error) throw error;
                    }
                }
                // DELETE edilen veriyi veritabanına TEKRAR EKLE (Geri al)
                else if (action.type === 'DELETE') {
                    if (action.oldData) {
                        const { error } = await supabase.from(action.table).insert(action.oldData);
                        if (error) throw error;
                    }
                }
                // UPDATE edilen veriyi ESKİ HALİNE UPSERT ET (Geri al)
                else if (action.type === 'UPDATE') {
                    if (action.oldData) {
                        const { error } = await supabase.from(action.table).upsert(action.oldData);
                        if (error) throw error;
                    }
                }
            }

            // İşlemler başarılı olduysa, undo logdan o ve önceki adımları temizle
            state.undoStack.splice(0, index + 1);

            // Verileri Supabase'den tekrar çek (senkronize et) ve UI'ı güncelle
            await sync();
            showToast("İşlemler başarıyla geri alındı!", 'info');
        } catch (err) {
            console.error("Geri Alma Hatası (RevertTo):", err);
            showToast("Geri alma işlemi sırasında bir hata oluştu. Bazı değişiklikler geri alınmamış olabilir; lütfen kontrol edip tekrar deneyin.", 'error');
        } finally {
            if(fab) fab.classList.remove('is-busy');
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

    // Phone menu: swipe right opens it, swipe left closes it. Ignored over inputs, open forms and sideways-scrolling
    // areas (like the profile tabs), and from the very left edge, where iPhone Safari uses the swipe for "back".
    (() => {
        let start = null;
        const blocked = el => {
            for (let node = el; node && node !== document.body; node = node.parentElement) {
                if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) return true;
                if (node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
            }
            return false;
        };
        document.addEventListener('touchstart', event => {
            const touch = event.touches[0];
            start = event.touches.length === 1 && !blocked(event.target) ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
        }, { passive: true });
        document.addEventListener('touchend', event => {
            if (!start) return;
            const touch = event.changedTouches[0];
            const from = start;
            start = null;
            const dx = touch.clientX - from.x;
            const dy = touch.clientY - from.y;
            if (Date.now() - from.time > 700 || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
            const toggle = document.querySelector('.mobile-logo');
            if (!toggle || toggle.offsetParent === null) return; // no drawer on desktop or in the client portal
            if ([...document.querySelectorAll('.modal')].some(modal => modal.style.display === 'block')) return;
            const isOpen = document.querySelector('.sidebar')?.classList.contains('mobile-open');
            if (dx > 0 && !isOpen && from.x > 24) window.toggleMobileMenu(true);
            if (dx < 0 && isOpen) window.toggleMobileMenu(false);
        }, { passive: true });
    })();

    window.goBack = () => {
        if (state.navHistory.length > 1) {
            state.navHistory.pop();
            window.nav(state.navHistory[state.navHistory.length - 1], false);
        } else {
            window.nav('members-view', false);
        }
    };

    // Back button: one history entry stays armed above the app's first one. A back press lands on the first entry, closes
    // the top layer and arms the entry again; with no layer left it goes back once more, which leaves the app.
    // Layers are read from the screen itself, so closing one with its own button leaves nothing stale behind.
    (() => {
        const arm = () => history.pushState({ zenBackGuard: true }, '');
        const closeTopLayer = () => {
            const modal = [...document.querySelectorAll('.modal')].find(m => m.style.display === 'block' && m.id !== 'modal-auth');
            if (modal) { window.closeModal(modal.id); return true; }
            if (sessionEl('member-session') && !sessionEl('member-session').hidden) { window.closeMemberSession(); return true; }
            if (document.body.classList.contains('member-portal-active')) {
                if (activeMemberPortalTab === 'overview') return false;
                window.selectMemberPortalTab(portalTabTrail.pop() || 'overview', true);
                return true;
            }
            if (document.body.classList.contains('portal-entered') && state.navHistory.length > 1) { window.goBack(); return true; }
            return false;
        };
        if (!history.state?.zenBackGuard) arm();
        window.addEventListener('popstate', () => {
            if (closeTopLayer()) arm();
            else history.back();
        });
    })();

    window.tab = (id) => {
        if (state.measurementRequired && id !== 'measurements') {
            showToast("Bu ay için ölçüm zorunludur! Lütfen önce ölçüm kaydedin.", 'error');
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
            btn.innerText = 'Durdur';
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
            showToast("Rapor başarıyla panoya kopyalandı! (WhatsApp veya Mail'e yapıştırabilirsiniz)", 'info');
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
        renderCoachInsights();
    };

    // Trainer-only "Koç özeti" card: adherence, this week's volume per muscle, personal records (logic in exercise-domain.js).
    const COACH_RECORD_ROWS = 8;
    const renderCoachInsights = () => {
        const card = document.getElementById('coach-insights');
        if (!card || !state.activeMemberId) return;
        const d = window.TrainerProExerciseDomain;
        const id = state.activeMemberId;
        const today = new Date().toLocaleDateString('en-CA');
        const sessions = state.workoutSessions.filter(s => s.member_id == id);
        const sets = d.performedSets(state.workouts.filter(w => w.member_id == id), sessions, state.sessionSteps);
        // Catalog key = trimmed, Turkish-lowercased name, the same key performedSets puts on every set.
        const muscleMap = new Map(state.exercises.map(ex => [String(ex.ad || '').trim().toLocaleLowerCase('tr'), d.normalize(ex).muscles]));
        const adh = d.adherence(state.schedules.filter(s => s.member_id == id), (state.attendance || []).filter(a => a.member_id == id), sets, today);
        const volume = d.weeklyVolume(sets, muscleMap, d.weekStartOf(today));
        const records = d.personalRecords(sets, today);
        const showAll = state.coachShowAllFor === id;
        const maxSets = Math.max(1, ...volume.map(row => row.sets));

        const volumeHtml = volume.length ? volume.map(row => `
            <div class="coach-row coach-volume-row">
                <span class="coach-name">${escapeHtml(row.muscle)}</span>
                <span>${row.sets} set</span><span>${d.formatNumber(row.tonnage)} kg</span>
                <span class="coach-bar"><span style="width:${Math.round(row.sets / maxSets * 100)}%"></span></span>
            </div>`).join('') : '<p class="coach-empty">Bu hafta kayıtlı set yok.</p>';
        const recordHtml = records.length ? records.map((rec, index) => `
            <div class="coach-row coach-record-row"${!showAll && index >= COACH_RECORD_ROWS ? ' hidden' : ''}>
                <span class="coach-name">${escapeHtml(rec.name)}${rec.isNew ? ' <span class="coach-badge">Yeni</span>' : ''}</span>
                <span>${d.formatNumber(rec.bestWeight.value)} kg × ${rec.bestWeight.reps ?? '-'}</span>
                ${rec.bestE1rm ? `<span class="coach-dim">Tahmini 1TM ${d.formatNumber(rec.bestE1rm.value)} kg</span>` : ''}
            </div>`).join('') : '<p class="coach-empty">Henüz rekor yok.</p>';
        const moreHtml = records.length > COACH_RECORD_ROWS && !showAll
            ? '<button type="button" class="btn-secondary coach-more" onclick="window.showAllCoachRecords()">Tümünü göster</button>' : '';

        card.innerHTML = `
            <h3>Koç özeti</h3>
            <h4>Katılım (son 4 hafta)</h4>
            <p class="coach-adherence">${adh.planned ? `${adh.done}/${adh.planned} antrenman · %${Math.round(adh.ratio * 100)}` : 'Haftalık program yok.'}</p>
            <h4>Bu haftanın hacmi</h4>${volumeHtml}
            <h4>Kişisel rekorlar</h4>${recordHtml}${moreHtml}`;
    };
    window.showAllCoachRecords = () => { state.coachShowAllFor = state.activeMemberId; renderCoachInsights(); };

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
                if(s) { labels.push(new Date(w.tarih).toLocaleDateString('tr-TR')); const weight = parseFloat(s.weight); data.push(Number.isFinite(weight) ? weight : null); }
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
        // Green means better, red worse; metrics without an unambiguous direction stay neutral.
        const getPointColor = (delta, better) => {
            if (!better || delta === null || delta === 0) return '#e4ba94';
            return (delta < 0) === (better === 'lower') ? '#35d07f' : '#ff5b67';
        };
        const better = cat === 'antrenman' ? 'higher' : (cat === 'olcum' || cat === 'testler') ? measurementField?.better : null;
        // Workout points are compared with the last real value; a set without weight is skipped.
        let lastWeight = null;
        const colourDeltas = cat === 'antrenman' ? data.map(value => {
            if (!Number.isFinite(value)) return null;
            const delta = lastWeight === null ? null : value - lastWeight;
            lastWeight = value;
            return delta;
        }) : chartDeltas;
        const pointColors = data.map((_, i) => getPointColor(colourDeltas[i] ?? null, better));

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
            hintDiv.innerHTML = `Son Performans: <b>${last.weight}kg x ${last.reps}</b> (${new Date(last.date).toLocaleDateString('tr-TR')})`;
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

            let anaIcon = ana === 'Yiyecekler' ? '' : (ana === 'İçecekler' ? '' : '');
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
                                        <span>${f.kalori} kcal</span>
                                        <span>P: ${f.protein}g</span>
                                        <span>C: ${f.karbonhidrat}g</span>
                                        <span>Y: ${f.yag}g</span>
                                    </div>
                                    <div class="card-actions mt-1">
                                        <button class="btn-edit" aria-label="Düzenle" onclick="window.editFood(${f.id})"></button>
                                        <button class="btn-delete" aria-label="Sil" onclick="window.deleteFood(${f.id})"></button>
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
        const id = existingId || window.TrainerProDataService.newId();
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
                        <button class="btn-delete" aria-label="Sil" onclick="event.stopPropagation(); window.deleteDietPlan(${d.id})"></button>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; font-size:0.8rem; margin-top:0.5rem; color:var(--text-dim);">
                    <span>${tCal.toFixed(0)} kcal</span>|<span>P: ${tPro.toFixed(0)}g</span>|<span>C: ${tCarb.toFixed(0)}g</span>|<span>Y: ${tFat.toFixed(0)}g</span>
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
                    <input type="text" class="ex-select m-search w-full" aria-label="Besin ara" placeholder="Besin Ara (Örn: Tavuk, Yulaf)..." oninput="window.searchFoodForDiet(this)" autocomplete="off" value="${vals.searchName || ''}">
                    <input type="hidden" class="m-name" required value="${vals.foodId || ''}">
                    <div class="m-search-results" style="display:none; position:absolute; top:100%; left:0; width:100%; background:var(--bg); border:1px solid var(--border); border-radius:4px; max-height:200px; overflow-y:auto; z-index:1000; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>
                </div>
            </div>
            <div class="grid" style="grid-template-columns: 2fr 1.5fr 1.5fr 1.5fr 1.5fr 1fr; gap:0.5rem; align-items:end;">
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Miktar</label>
                    <input type="number" step="0.1" class="m-qty w-full" aria-label="Miktar" value="${vals.qty || ''}" required oninput="window.updateMealRow(this)" style="padding:0.4rem; border-radius:4px;" ${vals.baseAmount ? `data-base-amount="${vals.baseAmount}" data-base-cal="${vals.baseCal}" data-base-pro="${vals.basePro}" data-base-carb="${vals.baseCarb}" data-base-fat="${vals.baseFat}"` : ''}>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Kcal</label>
                    <input type="number" step="0.1" class="m-cal w-full" aria-label="Kalori" value="${vals.cal || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Pro(g)</label>
                    <input type="number" step="0.1" class="m-pro w-full" aria-label="Protein" value="${vals.pro || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Karb(g)</label>
                    <input type="number" step="0.1" class="m-carb w-full" aria-label="Karbonhidrat" value="${vals.carb || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Yağ(g)</label>
                    <input type="number" step="0.1" class="m-fat w-full" aria-label="Yağ" value="${vals.fat || ''}" required oninput="window.updateDietTotals()" style="padding:0.4rem; border-radius:4px;">
                </div>
                <div class="form-group" style="margin:0; text-align:right; display:flex; justify-content:flex-end; gap:0.4rem;">
                    <button type="button" aria-label="Satırı kopyala" onclick="window.duplicateFoodRow(this)" style="background:transparent; border:none; color:var(--primary-color, #4CAF50); font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Bu besini kopyala">⧉</button>
                    <button type="button" aria-label="Satırı sil" onclick="this.parentElement.parentElement.parentElement.remove(); window.updateDietTotals();" style="background:transparent; border:none; color:#ff4444; font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Sil">×</button>
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
            <button type="button" class="btn-delete" aria-label="Öğünü kaldır" onclick="this.parentElement.remove(); window.updateDietTotals();" style="position:absolute; top:5px; right:5px; width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;">×</button>

            <div class="form-group" style="margin-bottom:0.8rem; padding-right: 30px;">
                <label style="display:block; margin-bottom:0.2rem; color:var(--text-dim); font-size:0.8rem;">Öğün Adı</label>
                <select class="m-meal-name w-full" aria-label="Öğün" required style="font-weight:bold;">
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
                    <span style="color:var(--text-dim); font-size:0.7rem;">${escapeHtml(f.tip || 'Yemek')} - ${escapeHtml(f.porsiyon)} | ${f.kalori} P:${f.protein} C:${f.karbonhidrat} Y:${f.yag}</span>
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
            id: window.TrainerProDataService.newId(),
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
        showToast("Beslenme planı başarıyla kaydedildi!", 'info');
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
                        ${grandCal.toFixed(0)} <span style="font-size:0.8rem; color:var(--text-dim); font-weight:normal;">kcal</span> &nbsp;|&nbsp;
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
                        <strong style="color: var(--text);">${escapeHtml(mealName)}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-dim);">
                            ${data.tCal.toFixed(1)} | P: ${data.tPro.toFixed(1)} | C: ${data.tCarb.toFixed(1)} | Y: ${data.tFat.toFixed(1)}
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

    const PENDING_STATE_KEYS = {
        uyeler: 'members', programlar: 'programs', olcumler: 'measurements', antrenmanlar: 'workouts', dokumanlar: 'documents',
        weekly_program_schedule: 'schedules', master_egzersizler: 'exercises', master_besinler: 'foods', beslenme_planlari: 'diets',
        health_metrics: 'healthMetrics', workout_sessions: 'workoutSessions', workout_session_steps: 'sessionSteps', device_connections: 'deviceConnections'
    };

    function refreshAll() {
        try {
            const pending = currentUserId ? dataService.getPending(currentUserId) : [];
            if (pending.length) {
                Object.entries(PENDING_STATE_KEYS).forEach(([table, key]) => {
                    state[key] = window.TrainerProDataService.applyPending(state[key], table, pending);
                });
            }
            renderMembers();
            if (state.activeMemberId) renderProfileHeader(state.activeMemberId);
            renderWeeklySchedule();
            renderAssessmentAdmin();
            renderWorkoutHistory();
            renderMemberSessions();
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
            const measuredCount = state.measuredMemberIds ? state.measuredMemberIds.size : '…'; // loaded in the background
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

        
        grid.innerHTML = state.members.length ? state.members.map(m => {
            const memberSchedule = state.schedules.filter(item => item.member_id == m.id)
                .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
            const scheduleText = memberSchedule.length
                ? memberSchedule.slice(0, 2).map(item => `${getScheduleDayName(item.day_of_week)} ${item.start_time.slice(0, 5)}`).join(' · ')
                : 'Henüz seans atanmadı';
            return `
            <div class="card member-card" onclick="window.openProfile(${m.id})">
                <div class="member-card-top">
                    <div class="member-avatar">${escapeHtml(((m.ad_soyad || '').trim().charAt(0) || '?').toLocaleUpperCase('tr-TR'))}</div>
                    <span class="member-card-arrow">→</span>
                </div>
                <small class="member-card-trainer">Eğitmen: ${escapePortalText(m.trainer_id === 'burak-ozcan' ? 'Burak Özcan' : 'Atanmadı')}</small>
                <h3>${escapeHtml(m.ad_soyad)}</h3>
                <p class="member-branch">${escapeHtml(m.brans || 'Branş belirtilmemiş')}</p>
                <p class="member-schedule-summary">${escapePortalText(scheduleText)}</p>
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
            showToast('Lütfen programa atanacak üyeyi seçin.', 'error');
            return;
        }
        const assignedMember = state.members.find(member => String(member.id) === String(memberId));
        if (!assignedMember?.trainer_id) {
            showToast('Bu üyeye önce yönetici panelindeki üye kartından bir eğitmen atayın.', 'error');
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
            showToast('Lütfen her seans için gün, başlangıç ve bitiş saati seçin.', 'error');
            return;
        }
        if (rows.some(row => row.end_time <= row.start_time)) {
            showToast('Bitiş saati başlangıç saatinden sonra olmalıdır.', 'error');
            return;
        }
        const keys = rows.map(row => `${row.day_of_week}-${row.start_time}`);
        if (new Set(keys).size !== keys.length) {
            showToast('Aynı gün ve başlangıç saati yalnızca bir kez eklenebilir.', 'error');
            return;
        }
        const conflict = findScheduleConflict(rows, id);
        if (conflict) {
            const conflictEnd = conflict.end_time?.slice(0, 5) ||
                `${String(Math.floor(scheduleEndMinutes(conflict) / 60)).padStart(2, '0')}:${String(scheduleEndMinutes(conflict) % 60).padStart(2, '0')}`;
            showToast(`Bu üyenin ${getScheduleDayName(conflict.day_of_week)} günü ${conflict.start_time.slice(0, 5)} - ${conflictEnd} arasında${conflict.branch ? ` ${conflict.branch}` : ''} seansı var. Çakışan seansları düzeltmeden kaydedemezsiniz.`, 'error');
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
            id: id && index === 0 ? id : window.TrainerProDataService.newId()
        }));
        const { error } = await dataService.mutate('weekly_program_schedule', 'upsert', entries);
        if (error) {
            handleError(error, 'Schedule save');
            showToast(`Çizelge kaydedilemedi: ${trMessage(error)}`, 'error');
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
                showToast(`Seans kaydedildi ancak üye branşı güncellenemedi: ${trMessage(memberError)}`, 'error');
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
            showToast(`Seans silinemedi: ${trMessage(error)}`, 'error');
            return;
        }
        if (deletedEntry) {
            await createScheduleNotification({
                memberId: deletedEntry.member_id,
                scheduleId: null, // the row is already gone: a reference to it is rejected by the database
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
            ['Hizmet beklentileri', answers.beklentiler || member.beklentiler],
            ['KVKK açık rıza', answers.kvkk_riza?.accepted ? `Verildi · ${answers.kvkk_riza.version} · ${answers.kvkk_riza.accepted_at ? new Date(answers.kvkk_riza.accepted_at).toLocaleString('tr-TR') : '--'}` : 'Kayıt yok']
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
                                    <button class="btn-edit" aria-label="Düzenle" onclick="window.editExercise(${ex.id})"></button>
                                    <button class="btn-delete" aria-label="Sil" onclick="window.deleteExercise(${ex.id})"></button>
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
                                    <button class="btn-edit" aria-label="Düzenle" onclick="event.stopPropagation(); window.editProgram(${p.id})"></button>
                                    <button class="btn-delete" onclick="event.stopPropagation(); window.deleteProgram(${p.id})">Sil</button>
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
                    <h3 style="color: var(--accent);">${new Date(m.tarih).toLocaleDateString('tr-TR')}</h3>
                    <div class="card-actions">
                        <button class="btn-edit" aria-label="Düzenle" onclick="event.stopPropagation(); window.editCardioTest(${m.id})"></button>
                        <button class="btn-delete" aria-label="Sil" onclick="event.stopPropagation(); window.deleteMeasurement(${m.id})"></button>
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
                        <button class="btn-edit" aria-label="Düzenle" onclick="event.stopPropagation(); window.editMeasurement(${m.id})"></button>
                        <button class="btn-delete" aria-label="Sil" onclick="event.stopPropagation(); window.deleteMeasurement(${m.id})"></button>
                    </div>
                </div>
                <p>Kilo: ${m.weight ?? '--'}kg | Yağ: %${m.fat ?? '--'}</p>
                <div class="measurement-deltas">${deltaHtml}</div>
            </div>
        `;
        }).join('');
    }

    function renderMemberSessions() {
        const card = document.getElementById('member-sessions-card');
        if (!card) return;
        const d = window.TrainerProExerciseDomain;
        const recent = state.workoutSessions.filter(s => s.member_id == state.activeMemberId)
            .map(s => ({ s, steps: state.sessionSteps.filter(r => String(r.workout_session_id) === String(s.id)) }))
            .filter(item => item.steps.length)
            .sort((a, b) => new Date(b.s.started_at) - new Date(a.s.started_at)).slice(0, 5);
        const items = recent.map(({ s, steps }) => {
            const workout = state.workouts.find(w => String(w.id) === String(s.metadata && s.metadata.workoutId));
            const lines = d.groupSteps(steps).map(g => `<div>${escapeHtml(g.exerciseName)}: ${g.sets.map(x => escapeHtml(d.formatSet(x.weight, x.reps, x.durationSeconds))).join(' · ')}</div>`).join('');
            return `<div class="workout-item"><div class="workout-meta">${new Date(s.started_at).toLocaleString('tr-TR')}${s.status === 'active' ? ' · Devam ediyor' : ''} · ${steps.length} set</div><h3>${escapeHtml((workout && workout.sablon) || 'Antrenman')}</h3>${lines}</div>`;
        }).join('');
        card.innerHTML = `<h3>Danışan kayıtları</h3>${items || '<div class="no-results mt-1">Danışan henüz antrenman kaydı girmedi.</div>'}`;
    }

    function renderWorkoutHistory() {
        const container = document.getElementById('workout-history-tree');
        if (!container) return;
        const myW = state.workouts.filter(w => w.member_id == state.activeMemberId).sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
        const repeatButton = document.getElementById('btn-repeat-workout');
        if (repeatButton) repeatButton.hidden = myW.length === 0;
        if (myW.length === 0) { container.innerHTML = '<div class="no-results mt-1">Antrenman yok.</div>'; return; }
        container.innerHTML = myW.map(w => `
            <div class="workout-item" onclick="window.showWorkoutDetail(${w.id})" style="cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div><div class="workout-meta">${new Date(w.tarih).toLocaleDateString('tr-TR')}</div><h3>${escapeHtml(w.sablon)}</h3></div>
                    <div class="card-actions">
                        <button class="btn-delete" aria-label="Sil" onclick="event.stopPropagation(); window.deleteWorkout(${w.id})"></button>
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
                    <button onclick="window.viewDocument(${jsAttr(d.yol)})" class="btn-view" aria-label="Görüntüle"></button>
                    <button onclick="window.deleteDocument(${d.id}, ${jsAttr(d.yol)})" class="btn-delete" aria-label="Sil"></button>
                </div>
            </div>
        `).join('');

        html += myCloudFiles.map(f => `
            <div class="doc-card">
                <div class="doc-info"><h4>${escapeHtml(f.name.split('_').slice(1).join('_') || f.name)}</h4><span>Bulut</span></div>
                <div class="doc-actions">
                    <button onclick="window.viewDocument(${jsAttr(`${state.activeMemberId}/${f.name}`)})" class="btn-view" aria-label="Görüntüle"></button>
                    <button onclick="window.deleteOnlyCloudDoc(${jsAttr(`${state.activeMemberId}/${f.name}`)})" class="btn-delete" aria-label="Sil"></button>
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
        const id = existingId || window.TrainerProDataService.newId();
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
            showToast(`Üye kaydedilemedi: ${trMessage(error)}`, 'error');
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
        const id = existingId || window.TrainerProDataService.newId();
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
            showToast(`Egzersiz kaydedilemedi: ${trMessage(error)}`, 'error');
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
            showToast("Önceki bir ölçüm bulunamadı.", 'info');
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

    // Disables the form's submit button while saving, so a second tap on a slow connection cannot save twice.
    const whileSaving = async (e, task) => {
        const button = e.target.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try { await task(); } finally { if (button) button.disabled = false; }
    };

    window.saveCardioTest = (e) => whileSaving(e, async () => {
        e.preventDefault();
        const existingId = document.getElementById('c-id').value;
        const id = existingId || window.TrainerProDataService.newId();
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
        if (!measurementResult.queued) showToast("Test kaydedildi!", 'info');
    });

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

    window.saveMeasurement = (e) => whileSaving(e, async () => {
        e.preventDefault();
        const existingId = document.getElementById('m-id').value;
        const id = existingId || window.TrainerProDataService.newId();
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
        if (!measurementResult.queued) showToast("Ölçüm kaydedildi!", 'info');
    });

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
    // Opens the workout form filled from the client's latest workout, dated today. Nothing is saved until the trainer submits.
    window.repeatLastWorkout = () => {
        const last = window.TrainerProExerciseDomain.lastWorkout(state.workouts.filter(w => w.member_id == state.activeMemberId));
        if (!last) return;
        window.openWorkoutModal();
        const parsed = window.safeJSONParse(last.setler, []);
        const sets = Array.isArray(parsed) ? parsed : [];
        const num = window.TrainerProExerciseDomain.parseNumber;
        document.getElementById('w-name').value = last.sablon || '';
        document.getElementById('w-rpe').value = last.rpe ?? '';
        document.getElementById('w-tempo').value = last.tempo || '';
        document.getElementById('w-rest').value = last.rest_seconds ?? '';
        let wrapper = null, current = null;
        sets.forEach(set => {
            if (!wrapper || set.ad !== current) {
                current = set.ad;
                window.addSetRowToWorkout();
                wrapper = [...document.querySelectorAll('.set-row-wrapper')].pop();
                wrapper.querySelector('.sets-container').innerHTML = '';
                const select = wrapper.querySelector('.s-name');
                // An exercise deleted from the catalog still has to round-trip.
                if (set.ad && ![...select.options].some(o => o.value === set.ad)) select.add(new Option(set.ad, set.ad));
                select.value = set.ad || '';
            }
            // Number inputs blank a decimal comma ("110,5"), so stored text is parsed first; legacy rows hold `set` sets of `tekrar`.
            const values = { weight: num(set.weight) ?? '', reps: num(set.reps ?? set.tekrar) ?? '', sure: num(set.sure) ?? '', tip: set.tip };
            const count = set.reps === undefined && num(set.set) > 0 ? num(set.set) : 1;
            for (let i = 0; i < count; i++) window.addSingleSet(wrapper.querySelector('.sets-container'), values);
        });
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
                    <input type="number" step="0.5" class="s-weight" aria-label="Ağırlık (kg)" required style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.weight ?? ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Tekrar</label>
                    <input type="number" class="s-reps" aria-label="Tekrar" required style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.reps ?? ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Süre(sn)</label>
                    <input type="number" class="s-sure" aria-label="Süre (sn)" style="width:100%; text-align:center; padding:0.4rem; border-radius:4px;" value="${vals.sure || ''}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="display:block; margin-bottom:0.1rem; color:var(--text-dim); font-size:0.7rem;">Tip</label>
                    <select class="s-tip w-full" aria-label="Set tipi" style="padding:0.4rem; font-size:0.75rem; border-radius:4px;">
                        <option value="Normal">Normal</option>
                        <option value="İzometrik">İzometrik</option>
                        <option value="Egzantrik">Egzantrik</option>
                        <option value="Dropset">Dropset</option>
                        <option value="Superset">Superset</option>
                        <option value="1RM">1RM</option>
                    </select>
                </div>
                <div class="form-group" style="margin:0; text-align:right; display:flex; justify-content:flex-end; gap:0.4rem;">
                    <button type="button" aria-label="Seti kopyala" onclick="window.duplicateSet(this)" style="background:transparent; border:none; color:var(--primary-color, #4CAF50); font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Bu seti kopyala">⧉</button>
                    <button type="button" aria-label="Seti sil" onclick="this.parentElement.parentElement.parentElement.remove()" style="background:transparent; border:none; color:#ff4444; font-size:1.2rem; cursor:pointer; padding:0; line-height:1;" title="Sil">×</button>
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
            <button type="button" class="btn-delete" aria-label="Egzersizi kaldır" onclick="this.parentElement.remove()" style="position:absolute; top:5px; right:5px; width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;">×</button>

            <div class="form-group" style="margin-bottom:0.8rem; padding-right: 30px;">
                <label style="display:block; margin-bottom:0.2rem; color:var(--text-dim); font-size:0.8rem;">Egzersiz</label>
                <select class="ex-select s-name w-full" aria-label="Egzersiz" required style="font-weight:bold;">
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

    window.saveWorkout = (e) => whileSaving(e, async () => {
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
            id: window.TrainerProDataService.newId(),
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
        if (!workoutResult.queued) showToast("Antrenman kaydedildi!", 'info');
    });

    // A trainer logs for the client whose profile is open; a client logs for their own row.
    const sessionMemberId = () => document.body.classList.contains('member-portal-active') ? activeMemberPortalMemberId : state.activeMemberId;
    const savedStepIds = new Map(); // "sessionId:stepIndex" -> row id, so an edit keeps the row's id

    window.startWorkoutSession = async (workoutId, activityType = 'traditional_strength') => {
        const memberId = sessionMemberId();
        if (!memberId) {
            showToast('Danışan bulunamadı.', 'error');
            throw new Error('Danışan bulunamadı.');
        }
        const session = {
            id: window.TrainerProDataService.newId(),
            member_id: memberId,
            source: 'trainer_pro',
            activity_type: activityType,
            status: 'active',
            started_at: new Date().toISOString(),
            metadata: { appVersion: APP_VERSION, workoutId }
        };
        const result = await dataService.mutate('workout_sessions', 'upsert', session);
        if (result.error) throw result.error;
        state.activeWorkoutSession = session;
        return session;
    };

    window.finishWorkoutSession = async (summary = {}, status = 'completed') => {
        const session = state.activeWorkoutSession;
        if (!session) throw new Error('Aktif antrenman oturumu bulunamadı.');
        const completed = {
            ...session,
            status,
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
        const key = `${session.id}:${step.stepIndex}`;
        const known = state.sessionSteps.find(row => row.workout_session_id == session.id && row.step_index === step.stepIndex);
        const payload = {
            id: savedStepIds.get(key) || known?.id || step.id || window.TrainerProDataService.newId(),
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
        if (!result.error) savedStepIds.set(key, payload.id);
        return result;
    };

    // --- Client workout session screen: log sets, rest countdown ---
    const SESSION_ACTIVE_MS = 12 * 36e5; // an unfinished session older than this is not offered for "Devam Et"
    const SESSION_STEP = { w: 2.5, r: 1, s: 5 };
    const sessionUi = { workoutId: null, rest: 60, draft: {}, editing: new Set(), endsAt: 0, phase: 'idle', timer: null, hideTimer: null, wakeLock: null, audio: null, beep: null, starting: false };
    const sessionEl = id => document.getElementById(id);
    const sessionDomain = () => window.TrainerProExerciseDomain;

    const activeSessionFor = (workoutId, sessions) => (sessions || [])
        .filter(item => item.status === 'active' && String(item.metadata?.workoutId) === String(workoutId) && Date.now() - new Date(item.started_at) < SESSION_ACTIVE_MS)
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];

    // A write that was sent (not queued) is not in the portal data yet; a queued one is laid over by the pending overlay.
    const patchPortalRows = (key, row) => {
        if (memberPortalData) memberPortalData[key] = [...(memberPortalData[key] || []).filter(item => item.id !== row.id), row];
    };

    // Alerts at rest end: each one only where the browser has it.
    const unlockSessionAudio = () => {
        try {
            if (navigator.audioSession) navigator.audioSession.type = 'playback';
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            sessionUi.audio = sessionUi.audio || new Ctx();
            sessionUi.audio.resume?.();
        } catch (error) {
            console.warn('Ses başlatılamadı:', error);
        }
    };
    const cancelSessionBeep = () => {
        try { sessionUi.beep?.stop(); } catch (error) { console.warn('Ses durdurulamadı:', error); }
        sessionUi.beep = null;
    };
    const scheduleSessionBeep = seconds => {
        cancelSessionBeep();
        const ctx = sessionUi.audio;
        if (!ctx || seconds <= 0) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.2;
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const at = ctx.currentTime + seconds; // the audio clock keeps time while the page timers are throttled
        osc.start(at);
        osc.stop(at + 0.3);
        sessionUi.beep = osc;
    };
    const sessionHaptic = () => sessionEl('member-session-haptic')?.click(); // iOS 17.4+ ticks when a switch toggles

    const requestSessionWakeLock = async () => {
        if (!navigator.wakeLock || sessionUi.wakeLock || !sessionUi.workoutId) return;
        try {
            sessionUi.wakeLock = await navigator.wakeLock.request('screen');
            sessionUi.wakeLock.addEventListener('release', () => { sessionUi.wakeLock = null; });
        } catch (error) {
            // Refused (low battery, hidden tab): the screen may sleep, nothing else breaks.
        }
    };

    const hideSessionRest = () => {
        window.clearInterval(sessionUi.timer);
        window.clearTimeout(sessionUi.hideTimer);
        sessionUi.timer = sessionUi.hideTimer = null;
        sessionUi.phase = 'idle';
        cancelSessionBeep();
        const bar = sessionEl('member-session-rest-bar');
        if (bar) bar.hidden = true;
    };
    const tickSessionRest = () => {
        if (sessionUi.phase !== 'counting') return;
        const left = sessionDomain().restRemaining(sessionUi.endsAt, Date.now());
        if (left > 0) {
            sessionEl('member-session-rest-text').textContent = `Dinlenme: ${sessionDomain().formatClock(left)}`;
            return;
        }
        window.clearInterval(sessionUi.timer);
        sessionUi.timer = null;
        sessionUi.phase = 'done';
        sessionEl('member-session-rest-text').textContent = 'Dinlenme bitti';
        sessionEl('member-session-rest-live').textContent = 'Dinlenme bitti';
        navigator.vibrate?.([200, 100, 200]);
        sessionHaptic();
        sessionUi.hideTimer = window.setTimeout(hideSessionRest, 5000);
    };
    const startSessionRest = seconds => {
        hideSessionRest();
        sessionUi.endsAt = Date.now() + seconds * 1000; // an end time, so the clock is right after the screen slept
        sessionUi.phase = 'counting';
        sessionEl('member-session-rest-live').textContent = '';
        sessionEl('member-session-rest-bar').hidden = false;
        scheduleSessionBeep(seconds);
        sessionUi.timer = window.setInterval(tickSessionRest, 1000);
        tickSessionRest();
    };
    window.extendSessionRest = () => {
        if (sessionUi.phase !== 'counting') return startSessionRest(15);
        sessionUi.endsAt += 15000;
        scheduleSessionBeep(sessionDomain().restRemaining(sessionUi.endsAt, Date.now()));
        tickSessionRest();
    };
    window.skipSessionRest = hideSessionRest;
    window.adjustSessionRest = delta => {
        sessionUi.rest = Math.max(0, sessionUi.rest + delta);
        sessionEl('member-session-rest-label').textContent = sessionUi.rest > 0 ? `Dinlenme süresi: ${sessionUi.rest} sn` : 'Dinlenme süresi: Kapalı';
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && sessionUi.workoutId) {
            requestSessionWakeLock(); // the lock is dropped whenever the page is hidden
            tickSessionRest();
        }
    });

    const sessionPlan = () => {
        const workout = (memberPortalData?.workouts || []).find(item => String(item.id) === String(sessionUi.workoutId));
        return { workout, sets: workout ? sessionDomain().planSets(workout.setler) : [] };
    };
    const isTimedSet = set => set.targetSeconds !== null && set.targetReps === null;

    const sessionFieldMarkup = (stepIndex, key, label, mode, down, up, value) => `
        <div class="session-field">
            <label for="sess-${key}-${stepIndex}">${label}</label>
            <div class="session-stepper">
                <button type="button" class="btn-secondary" aria-label="${down}" onclick="window.stepSessionField(${stepIndex}, '${key}', -1)">−</button>
                <input id="sess-${key}-${stepIndex}" type="text" inputmode="${mode}" autocomplete="off" value="${escapeHtml(value)}" oninput="window.setSessionField(${stepIndex}, '${key}', this.value)">
                <button type="button" class="btn-secondary" aria-label="${up}" onclick="window.stepSessionField(${stepIndex}, '${key}', 1)">+</button>
            </div>
        </div>`;

    const sessionRowMarkup = (set, step, last) => {
        const d = sessionDomain();
        const i = set.stepIndex;
        const target = d.formatSet(set.targetWeight, set.targetReps, set.targetSeconds);
        const lastText = last ? d.formatSet(last.weight, last.reps, last.durationSeconds) : '';
        const head = `<div class="session-set-head"><strong>Set ${set.setNo}</strong>${target ? `<span>Hedef: ${target}</span>` : ''}${lastText ? `<span>Geçen sefer: ${lastText}</span>` : ''}</div>`;
        if (step && !sessionUi.editing.has(i)) {
            return `<li class="session-set is-done" data-step="${i}">${head}<div class="session-set-done"><span>✓ ${d.formatSet(step.weight, step.reps, step.duration_seconds)}</span><button type="button" class="btn-secondary session-edit" onclick="window.editSessionSet(${i})">Düzelt</button></div></li>`;
        }
        const num = value => (value === null || value === undefined ? '' : d.formatNumber(value));
        const source = step
            ? { w: step.weight, r: step.reps, s: step.duration_seconds }
            : last ? { w: last.weight, r: last.reps, s: last.durationSeconds } : { w: set.targetWeight, r: set.targetReps, s: set.targetSeconds };
        sessionUi.draft[i] = sessionUi.draft[i] || { w: num(source.w), r: num(source.r), s: num(source.s) };
        const draft = sessionUi.draft[i];
        const second = isTimedSet(set)
            ? sessionFieldMarkup(i, 's', 'Süre (sn)', 'numeric', 'Süreyi azalt', 'Süreyi artır', draft.s)
            : sessionFieldMarkup(i, 'r', 'Tekrar', 'numeric', 'Tekrarı azalt', 'Tekrarı artır', draft.r);
        return `<li class="session-set" data-step="${i}">${head}<div class="session-fields">${sessionFieldMarkup(i, 'w', 'Ağırlık (kg)', 'decimal', 'Ağırlığı azalt', 'Ağırlığı artır', draft.w)}${second}</div><div class="session-set-actions"><button type="button" class="btn-primary session-save" onclick="window.saveSessionSet(${i})">Tamam</button></div></li>`;
    };

    const renderMemberSession = () => {
        const screen = sessionEl('member-session');
        if (!screen || screen.hidden || !sessionUi.workoutId) return;
        const { workout, sets } = sessionPlan();
        if (!workout) return releaseMemberSession();
        const session = state.activeWorkoutSession;
        const steps = new Map(state.sessionSteps.filter(row => String(row.workout_session_id) === String(session.id)).map(row => [row.step_index, row]));
        const groups = new Map();
        sets.forEach(set => {
            const key = set.exerciseName.toLocaleLowerCase('tr');
            if (!groups.has(key)) groups.set(key, { name: set.exerciseName, sets: [] });
            groups.get(key).sets.push(set);
        });
        sessionEl('member-session-title').textContent = workout.sablon || 'Antrenman';
        window.adjustSessionRest(0);
        const list = sessionEl('member-session-list');
        const top = list.scrollTop;
        list.innerHTML = [...groups.values()].map(group => `
            <section class="session-exercise"><h3>${escapePortalText(group.name || 'Egzersiz')}</h3><ul class="session-sets">${group.sets.map(set =>
                sessionRowMarkup(set, steps.get(set.stepIndex), sessionDomain().lastNumbers(state.workoutSessions, state.sessionSteps, set.exerciseName, set.setNo, session.id))).join('')}</ul></section>`).join('')
            + '<button type="button" class="btn-primary session-finish" onclick="window.finishMemberSession()">Antrenmanı Bitir</button>';
        list.scrollTop = top;
    };

    window.startMemberSession = async (workoutId) => {
        if (sessionUi.starting) return;
        const workout = (memberPortalData?.workouts || []).find(item => String(item.id) === String(workoutId));
        const sets = workout ? sessionDomain().planSets(workout.setler) : [];
        if (!sets.length) return;
        sessionUi.starting = true;
        try {
            const existing = activeSessionFor(workoutId, state.workoutSessions);
            if (existing) state.activeWorkoutSession = existing;
            else patchPortalRows('workoutSessions', await window.startWorkoutSession(workoutId));
        } catch (error) {
            handleError(error, 'Start session');
            showToast(trMessage(error), 'error');
            return;
        } finally {
            sessionUi.starting = false;
        }
        Object.assign(sessionUi, { workoutId, draft: {}, editing: new Set(), rest: sets[0].restSeconds > 0 ? sets[0].restSeconds : 60 });
        sessionEl('member-session').hidden = false;
        renderMemberSession();
        sessionEl('member-session-title').focus();
        requestSessionWakeLock();
    };

    // Stops timers, audio and the wake lock and hides the screen (close, finish, logout).
    const releaseMemberSession = () => {
        hideSessionRest();
        if (sessionUi.audio) sessionUi.audio.close().catch(error => console.warn('Ses kapatılamadı:', error));
        sessionUi.audio = null;
        if (sessionUi.wakeLock) sessionUi.wakeLock.release().catch(error => console.warn('Ekran kilidi bırakılamadı:', error));
        sessionUi.wakeLock = null;
        sessionUi.workoutId = null;
        const screen = sessionEl('member-session');
        if (screen) screen.hidden = true;
    };
    window.closeMemberSession = () => {
        const workoutId = sessionUi.workoutId;
        releaseMemberSession();
        document.querySelector(`[data-session-start="${workoutId}"]`)?.focus();
    };

    // While the screen is open, Tab wraps inside it (the page behind is not reachable) and Escape closes it.
    document.addEventListener('keydown', event => {
        const screen = sessionEl('member-session');
        // defaultPrevented: the modal handler already used this key (e.g. Escape closed a modal over the screen).
        if (!screen || screen.hidden || topOpenModal() || event.defaultPrevented) return;
        if (event.key === 'Escape') { event.preventDefault(); window.closeMemberSession(); return; }
        if (event.key !== 'Tab') return;
        const items = [...screen.querySelectorAll('button, input, [href], select, textarea')]
            .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
        if (!items.length) return;
        const at = items.indexOf(document.activeElement);
        const target = event.shiftKey ? (at <= 0 ? items[items.length - 1] : null) : (at === -1 || at === items.length - 1 ? items[0] : null);
        if (target) { event.preventDefault(); target.focus(); }
    });

    window.setSessionField = (stepIndex, key, value) => {
        if (sessionUi.draft[stepIndex]) sessionUi.draft[stepIndex][key] = value;
    };
    window.stepSessionField = (stepIndex, key, direction) => {
        const input = sessionEl(`sess-${key}-${stepIndex}`);
        const next = Math.max(0, (sessionDomain().parseNumber(input.value) || 0) + direction * SESSION_STEP[key]);
        input.value = sessionDomain().formatNumber(next);
        window.setSessionField(stepIndex, key, input.value);
    };
    window.editSessionSet = (stepIndex) => {
        sessionUi.editing.add(stepIndex);
        delete sessionUi.draft[stepIndex];
        renderMemberSession();
        sessionEl(`sess-w-${stepIndex}`)?.focus();
    };

    window.saveSessionSet = async (stepIndex) => {
        unlockSessionAudio(); // must happen inside the tap: browsers only start audio after a user gesture
        sessionHaptic();
        const d = sessionDomain();
        const set = sessionPlan().sets.find(item => item.stepIndex === stepIndex);
        const session = state.activeWorkoutSession;
        if (!set || !session) return;
        const timed = isTimedSet(set);
        const read = key => sessionEl(`sess-${key}-${stepIndex}`);
        const weightText = read('w').value.trim();
        const weight = weightText === '' ? null : d.parseNumber(weightText);
        const second = d.parseNumber(read(timed ? 's' : 'r').value);
        const secondMax = timed ? 3600 : 999;
        const bad = (weightText !== '' && (weight === null || weight > 999)) ? 'w'
            : (second === null || !Number.isInteger(second) || second < 1 || second > secondMax) ? (timed ? 's' : 'r') : null;
        if (bad) {
            showToast('Geçerli bir sayı girin.', 'error');
            read(bad).focus();
            return;
        }
        const wasEdit = sessionUi.editing.has(stepIndex);
        const restSeconds = sessionUi.rest;
        const result = await window.saveWorkoutSessionStep({
            exerciseName: set.exerciseName, stepIndex, sets: 1, weight,
            reps: timed ? null : second, durationSeconds: timed ? second : null, restSeconds, completed: true
        });
        if (result.error) {
            handleError(result.error, 'Save session set');
            showToast(trMessage(result.error), 'error');
            return;
        }
        if (!result.queued) {
            patchPortalRows('sessionSteps', {
                id: savedStepIds.get(`${session.id}:${stepIndex}`), workout_session_id: session.id, exercise_name: set.exerciseName,
                step_index: stepIndex, sets: 1, reps: timed ? null : second, weight, duration_seconds: timed ? second : null,
                tempo: null, rest_seconds: restSeconds, rpe: null, completed: true, completed_at: new Date().toISOString()
            });
        }
        sessionUi.editing.delete(stepIndex);
        delete sessionUi.draft[stepIndex];
        showMemberPortal(memberPortalData, currentUserId); // from current data plus the pending overlay: no network round trip
        document.querySelector(`#member-session [data-step="${stepIndex}"] .session-edit`)?.focus();
        if (!wasEdit && sessionUi.rest > 0) startSessionRest(sessionUi.rest);
    };

    window.finishMemberSession = async () => {
        const session = state.activeWorkoutSession;
        if (!session) return;
        const logged = state.sessionSteps.some(row => String(row.workout_session_id) === String(session.id) && row.completed);
        try {
            patchPortalRows('workoutSessions', await window.finishWorkoutSession({}, logged ? 'completed' : 'cancelled'));
        } catch (error) {
            handleError(error, 'Finish session');
            showToast(trMessage(error), 'error');
            return;
        }
        releaseMemberSession();
        showToast(logged ? 'Antrenman kaydedildi.' : 'Kayıt yapılmadı.', logged ? 'success' : 'info');
        window.selectMemberPortalTab('workouts');
        showMemberPortal(memberPortalData, currentUserId); // the button reads "Antrenmanı Başlat" again
    };

    window.addExerciseRowToTemplate = (name = '') => {
        const container = document.getElementById('p-exercise-rows');
        const div = document.createElement('div');
        div.className = 'set-row-wrapper';
        div.innerHTML = `
            <div class="set-row">
                <select class="p-ex-name" aria-label="Egzersiz" required>
                    <option value="">Egzersiz Seç...</option>
                    ${state.exercises.map(ex => `<option value="${escapeHtml(ex.ad)}" ${ex.ad === name ? 'selected' : ''}>${escapeHtml(ex.ad)}</option>`).join('')}
                </select>
                <button type="button" class="btn-delete" aria-label="Egzersizi kaldır" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        container.appendChild(div);
    };

    window.handleProgramSubmit = async (e) => {
        e.preventDefault();
        const existingId = document.getElementById('edit-program-id').value;
        const id = existingId || window.TrainerProDataService.newId();
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
        showToast("Şablon kaydedildi!", 'info');
    };

    window.showProgramDetail = (id) => {
        try {
            const p = state.programs.find(x => x.id == id);
            if (!p) return;
            const details = window.safeJSONParse(p.detaylar, []);
            document.getElementById('detail-title').innerText = p.program_adi;
            document.getElementById('detail-body').innerHTML = `
                <ul class="m-list">
                    ${details.map(d => `<li>${escapeHtml(d.ad)}</li>`).join('')}
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
            showToast("Lütfen önce bir üye seçin.", 'error');
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
                    hint.innerText = `Son Performans: ${lastWeight}kg x ${lastReps}`;
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
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent);">Kardiyo & Metabolizma</h4>
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
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent);">Analiz</h4>
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
                        <h4 style="color: orange; margin-bottom: 0.5rem;">Simetri Analizi (>0.5cm)</h4>
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
                    ${escapeHtml(egzersizAdi)}
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
                const sureText = s.sure ? `<span style="color:var(--text-dim); font-size:0.75rem; margin-left: 4px;">${escapeHtml(s.sure)}s</span>` : '';

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
    // Deleting a client is permanent and complete (KVKK): the database removes all linked rows
    // (ON DELETE CASCADE), and their document files are removed from storage here.
    // No undo entry: it could only restore the profile row. Recovery is from a backup.
    window.deleteMember = async (id) => {
        const member = state.members.find(m => m.id == id);
        if (!member) return;
        await loadMemberData(id); // so the counts in the confirmation are the real ones
        const count = list => (list || []).filter(item => item.member_id == id).length;
        const answer = prompt(`${member.ad_soyad} ve tüm verileri kalıcı olarak silinecek: ${count(state.measurements)} ölçüm, ${count(state.workouts)} antrenman, ${count(state.diets)} beslenme planı, ${count(state.documents)} belge, haftalık program ve bildirim kayıtları. Bu işlem geri alınamaz. Onaylamak için danışanın adını yazın:`);
        if (answer === null) return;
        const normalize = value => String(value || '').trim().toLocaleLowerCase('tr-TR');
        if (normalize(answer) !== normalize(member.ad_soyad)) {
            showToast('İsim eşleşmedi, silme iptal edildi.', 'error');
            return;
        }
        // Files first: once the profile is gone, nothing in the app leads to them anymore.
        // Direct calls (not the offline queue): a deletion happens completely now, or not at all.
        try {
            const folder = String(id);
            const { data: files, error: listError } = await supabase.storage.from('dokumanlar').list(folder, { limit: 1000 });
            if (listError) throw listError;
            if (files?.length) {
                const { error: removeError } = await supabase.storage.from('dokumanlar').remove(files.map(file => `${folder}/${file.name}`));
                if (removeError) throw removeError;
            }
        } catch (e) {
            handleError(e, 'DeleteMember files');
            showToast(`Danışanın belgeleri buluttan silinemedi: ${trMessage(e)}. Danışan silinmedi, lütfen tekrar deneyin.`, 'error');
            return;
        }
        try {
            const { data, error } = await supabase.from('uyeler').delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data?.length) throw new Error('kayıt bulunamadı veya yetki yok');
        } catch (e) {
            handleError(e, 'DeleteMember');
            showToast(`Danışan silinemedi: ${trMessage(e)}`, 'error');
            return;
        }
        try { await sync(); } catch (e) { handleError(e, 'DeleteMember sync'); }
    };

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
            const { error } = await supabase.storage.from('dokumanlar').remove([encodedPath]);
            if (error) throw error;
            await window.scanStorageForDocs();
        } catch (e) {
            handleError(e, 'DeleteCloudDoc');
            showToast(`Döküman silinemedi: ${trMessage(e)}`, 'error');
        }
    };

    window.viewDocument = async (path) => {
        const win = window.open('', '_blank');
        try {
            const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
            const { data, error } = await supabase.storage.from('dokumanlar').createSignedUrl(encodedPath, 60);
            if (data?.signedUrl) win.location.href = data.signedUrl;
            else { if(win) win.close(); showToast("Hata: Dosya bulunamadı", 'error'); }
        } catch (e) { if(win) win.close(); }
    };

    window.uploadDocument = async (e) => {
        e.preventDefault();
        if (!navigator.onLine) {
            showToast('Belge yüklemek için internet bağlantısı gereklidir. Diğer değişiklikler çevrimdışı kuyruğa alınabilir.', 'error');
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
            showToast("Döküman yüklendi!", 'info');
            e.target.reset();
        } catch (err) { showToast("Hata: " + trMessage(err), 'error'); }
    };

    window.deleteDocument = async (id, path) => {
        if (!confirm("Döküman silinsin mi?")) return;
        const oldData = state.documents.find(d => d.id == id);
        const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
        // Delete the record first; the file is only removed once the record is gone.
        try {
            const { data, error } = await supabase.from('dokumanlar').delete().eq('id', id).select('id');
            if (error) throw error;
            if (!data?.length) throw new Error('kayıt bulunamadı veya yetki yok');
        } catch (e) {
            handleError(e, 'DeleteDoc');
            showToast(`Döküman silinemedi: ${trMessage(e)}`, 'error');
            return;
        }
        if (oldData) window.pushToUndoLog('DELETE', 'dokumanlar', oldData, null, `Döküman Silindi: ${oldData.adi}`);
        try {
            const { error } = await supabase.storage.from('dokumanlar').remove([encodedPath]);
            if (error) throw error;
        } catch (e) {
            handleError(e, 'DeleteDocFile');
            showToast(`Döküman kaydı silindi ancak dosya buluttan silinemedi: ${trMessage(e)}. Bulut listesinden tekrar silmeyi deneyin.`, 'error');
        }
        try { await sync(); } catch (e) { handleError(e, 'DeleteDoc sync'); }
    };

    // --- MEMBER PROFILE SYNC ---

    // Name and one-line summary at the top of a client's profile. Also called after every sync, so edits show up at once.
    const renderProfileHeader = (id) => {
        const m = state.members.find(x => x.id == id);
        if (!m) return;
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
    };

    window.openProfile = async (id) => {
        state.activeMemberId = id;
        renderProfileHeader(id);

        setSyncStatus('syncing', 'Üye verileri yükleniyor...');
        await loadMemberData(id);
        if (state.activeMemberId != id) return; // the user opened someone else while this was loading
        setSyncStatus(navigator.onLine ? 'online' : 'offline', navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı (Son Önbellek Kullanılıyor)');

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
            showToast("Bu ay için ölçümünüz eksik! Lütfen devam etmeden önce güncel ölçümlerinizi girin.", 'error');
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

    window.performGlobalSearch = async () => {
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
        if (includeMembers) state.members.filter(m => (m.ad_soyad || '').toLowerCase().includes(keyword) || (m.brans || '').toLowerCase().includes(keyword)).forEach(m => results.push({ type: 'Member', data: m }));
        if (includeProgs) state.programs.filter(p => (p.program_adi || '').toLowerCase().includes(keyword)).forEach(p => results.push({ type: 'Program', data: p }));
        if (includeWorkouts) {
            const token = state.searchToken = (state.searchToken || 0) + 1;
            let found = state.workouts.filter(w => (w.sablon || '').toLowerCase().includes(keyword)); // offline: what is cached
            if (navigator.onLine) {
                const pattern = '%' + keyword.replace(/[%_\\]/g, match => '\\' + match) + '%';
                const { data, error } = await supabase.from('antrenmanlar').select('*').ilike('sablon', pattern).order('tarih', { ascending: false }).limit(100);
                if (token !== state.searchToken) return; // a newer search replaced this one
                if (error) handleError(error, 'Workout search');
                else {
                    found = data || [];
                    // The detail view reads workouts from state, so keep what was found.
                    found.forEach(w => { if (!state.workouts.some(x => x.id == w.id)) state.workouts.push(w); });
                }
            }
            found.forEach(w => results.push({ type: 'Workout', data: w }));
        }

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
            if (r.type === 'Member') return `<div class="card" onclick="window.openProfile(${r.data.id})"><h3>${escapeHtml(r.data.ad_soyad)}</h3><p>${escapeHtml(r.data.brans)}</p></div>`;
            if (r.type === 'Program') return `<div class="card" onclick="window.showProgramDetail(${r.data.id})"><h3>${escapeHtml(r.data.program_adi)}</h3></div>`;
            if (r.type === 'Workout') return `<div class="card" onclick="window.showWorkoutDetail(${r.data.id})"><h3>${escapeHtml(r.data.sablon)}</h3><p>${new Date(r.data.tarih).toLocaleDateString('tr-TR')}</p></div>`;
            if (r.type === 'Exercise') {
                const g = window.safeJSONParse(r.data.gruplar, {});
                return `<div class="card" onclick="window.editExercise(${r.data.id})"><h3>${escapeHtml(r.data.ad)}</h3><p>${escapeHtml(g.bodyPart || '')} ${g.muscles ? '- ' + escapeHtml(g.muscles.join(', ')) : ''}</p></div>`;
            }
            if (r.type === 'Food') {
                return `<div class="card" onclick="window.editFood(${r.data.id})"><h3>${escapeHtml(r.data.ad)}</h3><p>${escapeHtml(r.data.tip || 'Yemek')} - ${escapeHtml(r.data.kalori)} kcal</p></div>`;
            }
        }).join('')}</div>`;

        if (totalCount > 100) {
            html += `<div style="text-align:center; padding:1rem; color:var(--text-dim); font-size:0.8rem; grid-column: 1 / -1;">Çok fazla sonuç bulundu (${totalCount}). Sadece ilk 100 sonuç gösteriliyor. Lütfen aramanızı daraltın.</div>`;
        }

        container.innerHTML = html;
    };

    // --- SYNC & INITIALIZATION ---

    // --- OFFLINE & LOCAL STORAGE CACHING ---
    function saveToLocal() {
        try {
            // Keep history only of members who still exist: a deleted client's data must not stay on the device (KVKK).
            const memberIds = new Set(state.members.map(member => String(member.id)));
            const ofMembers = rows => rows.filter(row => memberIds.has(String(row.member_id)));
            const keptSessions = ofMembers(state.workoutSessions);
            const keptSessionIds = new Set(keptSessions.map(session => String(session.id)));
            const stateToSave = {
                members: state.members,
                programs: state.programs,
                measurements: ofMembers(state.measurements),
                workouts: ofMembers(state.workouts),
                documents: ofMembers(state.documents),
                schedules: state.schedules,
                exercises: state.exercises,
                foods: state.foods,
                diets: ofMembers(state.diets),
                healthMetrics: ofMembers(state.healthMetrics),
                workoutSessions: keptSessions,
                sessionSteps: state.sessionSteps.filter(step => keptSessionIds.has(String(step.workout_session_id))),
                attendance: ofMembers(state.attendance),
                deviceConnections: state.deviceConnections,
                userId: currentUserId,
                lastSync: new Date().getTime()
            };
            if (!currentUserId) return;
            // shortcut: localStorage holds about 5 MB; move the cache to IndexedDB if a trainer's data outgrows it.
            localStorage.setItem('trainerpro_cache', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn("Yerel depolama hatası (Kota aşımı vb.):", e);
        }
    }

    // Returns the cache time (ms) or false. A member-shaped or other user's cache is simply not ours.
    function loadFromLocal() {
        try {
            const cached = localStorage.getItem('trainerpro_cache');
            if (cached) {
                const data = JSON.parse(cached);
                // Health data must not stay on a device forever: other user's, owner-less or 14-day-old caches are removed.
                if (!currentUserId || data.userId !== currentUserId || data.role === 'member' || !(Date.now() - data.lastSync < 14 * 864e5)) {
                    localStorage.removeItem('trainerpro_cache');
                    return false;
                }
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
                state.sessionSteps = data.sessionSteps || [];
                state.attendance = data.attendance || [];
                state.deviceConnections = data.deviceConnections || [];
                return data.lastSync;
            }
        } catch (e) {
            console.warn("Yerel depolama okuma hatası:", e);
        }
        return false;
    }

    // --- PER-MEMBER HISTORY ---
    // History tables (measurements, workouts, diets, documents, health data, sessions) are loaded for ONE client when their
    // profile is opened, not for everyone at login: login time no longer grows with the amount of history.
    const MEMBER_HISTORY = [['olcumler', 'measurements'], ['antrenmanlar', 'workouts'], ['beslenme_planlari', 'diets'],
        ['dokumanlar', 'documents'], ['health_metrics', 'healthMetrics'], ['workout_sessions', 'workoutSessions'], ['schedule_attendance', 'attendance']];

    // Adds the derived test values (age, resting HR, VO2 max, BMR...) that are not stored in the database.
    const enrichMeasurements = (rows, members) => rows.map(m => {
        // Restore test values from legacy columns
        m.yas = m.l_leg;
        m.rhr = m.r_leg;
        m.cooper = m.hips;
        const member = members.find(x => x.id == m.member_id);

        // Recalculate derived metrics (BMR, MHR, HRR, VO2) so they exist in state for the dashboard
        if (m.yas) {
            m.mhr = Math.round(208 - (0.7 * m.yas));
            if (m.rhr) m.hrr = m.mhr - m.rhr;
        }
        if (m.cooper) {
            const gender = member ? member.cinsiyet || 'Erkek' : 'Erkek';
            m.vo2max = gender === 'Kadın' ? (65.81 - (0.1847 * m.cooper)).toFixed(1) : (111.33 - (0.42 * m.cooper)).toFixed(1);
        }
        if (m.weight && m.yas && member && member.boy) {
            const base = (10 * m.weight) + (6.25 * member.boy) - (5 * m.yas);
            m.bmr = Math.round((member.cinsiyet || 'Erkek') === 'Kadın' ? base - 161 : base + 5);
        }
        return m;
    });

    // Replaces one client's history in state with fresh rows from the database. Offline: keeps the cached rows.
    async function loadMemberData(memberId) {
        if (!navigator.onLine) return false;
        const results = await Promise.all(MEMBER_HISTORY.map(([table]) => loadAll(table, { member_id: memberId })));
        const failed = results.find(result => result.error);
        if (failed) { handleError(failed.error, 'Member history load'); return false; }
        MEMBER_HISTORY.forEach(([, key], index) => {
            const rows = results[index].data || [];
            const others = state[key].filter(item => item.member_id != memberId);
            state[key] = others.concat(key === 'measurements' ? enrichMeasurements(rows, state.members) : rows);
            if (key === 'measurements' && state.measuredMemberIds) {
                state.measuredMemberIds[rows.length ? 'add' : 'delete'](memberId);
            }
        });
        const sessions = state.workoutSessions.filter(item => item.member_id == memberId);
        const steps = await loadSessionSteps(sessions);
        if (steps) {
            const sessionIds = new Set(sessions.map(item => String(item.id)));
            state.sessionSteps = state.sessionSteps.filter(step => !sessionIds.has(String(step.workout_session_id))).concat(steps);
        }
        saveToLocal();
        return true;
    }

    // Dashboard figure "clients with a measurement": reads only member ids, in the background, once per page load.
    async function loadMeasuredMembers() {
        if (state.measuredMemberIds || state.measuredMembersLoading) return;
        state.measuredMembersLoading = true;
        try {
            const rows = await dataService.fetchAll('olcumler', 1000, {}, 2, 'member_id');
            state.measuredMemberIds = new Set(rows.map(row => row.member_id));
            refreshAll();
        } catch (error) {
            handleError(error, 'Measured members load');
        } finally {
            state.measuredMembersLoading = false;
        }
    }

    async function sync() {
        const syncOffline = () => {
            const lastSync = loadFromLocal();
            refreshAll(); // also lays unsent changes over whatever the cache gave
            showOfflineStatus(lastSync);
            return false;
        };
        // Offline with a known user: skip getSession(), which cannot answer once the token has expired without a connection.
        if (!navigator.onLine && currentUserId) return syncOffline();
        const { data: sessionData } = await withAuthTimeout(
            supabase.auth.getSession(),
            'Oturum kontrolü zaman aşımına uğradı.'
        );
        currentUserId = sessionData.session?.user?.id || null;
        if (!sessionData.session) {
            setSyncStatus('offline', 'Yönetici girişi bekleniyor');
            return false;
        }
        if (!navigator.onLine) return syncOffline();

        // Önce hızlıca ekranı doldur (Optimistic UI)
        loadFromLocal();
        refreshAll();

        setSyncStatus('syncing', 'Senkronize ediliyor...');
        try {

            const results = await Promise.all([
                loadAll('uyeler'),
                loadAll('programlar'),
                loadAll('weekly_program_schedule'),
                dataService.fetchAll('master_egzersizler').then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                dataService.fetchAll('master_besinler').then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
                loadAll('device_connections')
            ]);

            const errIndex = results.findIndex(r => r.error);
            if (errIndex !== -1) {
                console.error("Supabase Error Data:", results[errIndex].error);
                throw new Error("Veritabanı hatası (kayıt " + (errIndex + 1) + "): " + trMessage(results[errIndex].error));
            }

            state.members = results[0].data || [];
            state.programs = results[1].data || [];
            state.schedules = results[2].data || [];
            state.exercises = results[3].data || [];
            state.foods = results[4].data || [];
            state.deviceConnections = results[5].data || [];
            // An open profile keeps showing fresh history after every sync (edits, live updates).
            if (state.activeMemberId) await loadMemberData(state.activeMemberId);

            saveToLocal(); // before the overlay, so the cache holds what the server said
            refreshAll();
            loadMeasuredMembers();
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
    // The worker keeps the app openable without signal (and receives pushes); no worker support is not an error.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(watchForNewVersion).catch(error => handleError(error, 'Service worker'));
    }

    // A new worker waits until the user taps Yenile, so old and new files are never mixed. A first install has no controller and never prompts.
    function watchForNewVersion(registration) {
        if (!registration) return; // workers blocked by the browser or the test: nothing to watch
        const offer = () => {
            if (!navigator.serviceWorker.controller || !registration.waiting || document.getElementById('update-bar')) return;
            const bar = document.createElement('div');
            bar.id = 'update-bar';
            bar.className = 'update-bar';
            bar.setAttribute('role', 'status');
            const text = document.createElement('span');
            text.textContent = 'Yeni sürüm hazır.';
            const refresh = document.createElement('button');
            refresh.type = 'button';
            refresh.id = 'update-refresh';
            refresh.textContent = 'Yenile';
            refresh.addEventListener('click', () => {
                // Another tab already activated the new worker: nothing is waiting, a plain reload loads it.
                if (!registration.waiting) return window.location.reload();
                refresh.disabled = true;
                navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
                registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            });
            const later = document.createElement('button');
            later.type = 'button';
            later.id = 'update-later';
            later.textContent = 'Sonra';
            later.addEventListener('click', () => bar.remove());
            bar.append(text, refresh, later);
            document.body.appendChild(bar);
        };
        offer();
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(); });
        });
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60 * 1000) return;
            lastCheck = Date.now();
            registration.update().catch(error => handleError(error, 'Service worker'));
        });
    }

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
            // Read only the cache time: loading the cache here could overwrite fresher in-memory data.
            let cache = null;
            try { cache = JSON.parse(localStorage.getItem('trainerpro_cache')); } catch { /* unreadable cache counts as none */ }
            showOfflineStatus(cache && cache.userId === currentUserId && Date.now() - cache.lastSync < 14 * 864e5 ? cache.lastSync : false);
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
        
        fab.setAttribute('aria-label', 'Yeni kayıt ekle');
        // On a client's profile page: add a measurement. Anywhere else: add a client.
        // (state.activeMemberId stays set after leaving a profile, so it can't decide this alone.)
        fab.onclick = () => {
            const onProfile = document.getElementById('profile-view')?.classList.contains('active');
            if (onProfile && state.activeMemberId) window.tab('measurements');
            else window.openModal('modal-member');
        };
        document.body.appendChild(fab);
    }

});
