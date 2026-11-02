(function () {
    "use strict";

    const config = window.SPRINT_SUPABASE_CONFIG;
    const feedback = document.getElementById("account-feedback");
    if (!config || !window.supabase || !feedback) {
        console.error("Account screens could not initialize: Supabase client/config is unavailable.");
        return;
    }

    const client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const signedOut = document.getElementById("account-signed-out");
    const signedIn = document.getElementById("account-signed-in");
    const emailLabel = document.getElementById("account-email");
    const displayName = document.getElementById("account-display-name");
    const myGamesStatus = document.getElementById("my-games-account-status");
    const myGamesList = document.getElementById("my-games-list");

    // Shared account bridge used by the game client for every room API call.
    // A missing session prevents create/join requests before they are sent.
    window.SprintCarAccount = {
        async getAccessToken() {
            const { data, error } = await client.auth.getSession();
            if (error) throw new Error(error.message);
            if (!data.session || !data.session.access_token) {
                throw new Error("You must create an account or sign in before creating or joining a game.");
            }
            return data.session.access_token;
        },
        async isAuthenticated() {
            try { await this.getAccessToken(); return true; }
            catch { return false; }
        },
        openProfile() { window.location.hash = "#profile"; }
    };

    function message(text, isError) {
        feedback.textContent = text;
        feedback.classList.toggle("is-error", Boolean(isError));
    }

    async function apiProfile(session, method, body) {
        const response = await fetch("/api/account/profile", {
            method,
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to load your player profile.");
        return result.profile;
    }

    async function loadMyGames(session) {
        myGamesList.replaceChildren();
        if (!session) return;
        const response = await fetch("/api/account/games", {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to load your games.");
        if (!result.games || result.games.length === 0) {
            const empty = document.createElement("p");
            empty.className = "account-note";
            empty.textContent = "No saved games yet. Create a game or join a friend's room and it will appear here.";
            myGamesList.append(empty);
            return;
        }
        for (const game of result.games) {
            const card = document.createElement("article");
            card.className = "saved-game-card";
            const heading = document.createElement("h3");
            heading.textContent = game.room_name || `Room ${game.room_code}`;
            const detail = document.createElement("p");
            detail.textContent = `Code: ${game.room_code} · ${game.player_role === "HOST" ? "Host" : "Player"} · ${game.status}`;
            const actions = document.createElement("div");
            actions.className = "saved-game-actions";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "primary-button";
            button.textContent = "Return to Game";
            button.dataset.rejoinRoom = game.room_code;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "secondary-button saved-game-remove";
            remove.textContent = "Remove from My Games";
            remove.dataset.removeRoom = game.room_code;
            actions.append(button, remove);
            card.append(heading, detail, actions);
            myGamesList.append(card);
        }
    }

    myGamesList.addEventListener("click", async (event) => {
        const removeButton = event.target.closest("[data-remove-room]");
        if (removeButton) {
            const roomCode = removeButton.dataset.removeRoom;
            if (!window.confirm(`Remove ${roomCode} from your My Games list? This will not delete the room or affect other players.`)) return;
            removeButton.disabled = true;
            try {
                const { data, error } = await client.auth.getSession();
                if (error || !data.session) throw new Error("Please sign in again to manage your saved games.");
                const response = await fetch("/api/account/games", {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ roomCode })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || "Unable to remove this game.");
                await loadMyGames(data.session);
                message("Game removed from your My Games list. The shared room was not deleted.");
            } catch (error) {
                message(error.message, true);
                removeButton.disabled = false;
            }
            return;
        }
        const button = event.target.closest("[data-rejoin-room]");
        if (!button) return;
        button.disabled = true;
        button.textContent = "Rejoining…";
        try {
            if (!window.SprintCarGame || typeof window.SprintCarGame.rejoin !== "function") {
                throw new Error("The game client is still loading. Please try again.");
            }
            await window.SprintCarGame.rejoin(button.dataset.rejoinRoom);
        } catch (error) {
            message(error.message, true);
            button.disabled = false;
            button.textContent = "Return to Game";
        }
    });

    async function renderSession(session) {
        const authenticated = Boolean(session && session.user);
        signedOut.hidden = authenticated;
        signedIn.hidden = !authenticated;
        if (!authenticated) {
            emailLabel.textContent = "";
            myGamesStatus.textContent = "Sign in to see the games associated with your account.";
            myGamesList.replaceChildren();
            return;
        }
        emailLabel.textContent = session.user.email || "Signed-in player";
        myGamesStatus.textContent = `Signed in as ${session.user.email}.`;
        try {
            const profile = await apiProfile(session, "GET");
            await loadMyGames(session);
            displayName.value = profile ? profile.display_name : "";
            message(profile ? "You're signed in. Your player profile is ready." : "You're signed in. Choose a display name and save your profile.");
        } catch (error) {
            message(`${error.message} The account is signed in, but the profile service may not be deployed yet.`, true);
        }
    }

    const accountEmail = document.getElementById("account-email-input");
    const accountPassword = document.getElementById("account-password-input");
    document.getElementById("account-login-button").addEventListener("click", async () => {
        if (!accountEmail.reportValidity() || !accountPassword.reportValidity()) return;
        message("Signing in…");
        const { data, error } = await client.auth.signInWithPassword({ email: accountEmail.value.trim(), password: accountPassword.value });
        if (error) return message(error.message, true);
        await renderSession(data.session);
    });

    document.getElementById("account-signup-button").addEventListener("click", async () => {
        if (!accountEmail.reportValidity() || !accountPassword.reportValidity()) return;
        if (accountPassword.value.length < 8) return message("Your password must be at least 8 characters long.", true);
        message("Creating your account…");
        const { data, error } = await client.auth.signUp({ email: accountEmail.value.trim(), password: accountPassword.value });
        if (error) return message(error.message, true);
        if (data.session) await renderSession(data.session);
        else message("Account created. Check your email for the confirmation link, then sign in.");
    });

    document.getElementById("account-forgot-password").addEventListener("click", async () => {
        if (!accountEmail.reportValidity()) return message("Enter your email address first.", true);
        message("Sending password reset email…");
        const { error } = await client.auth.resetPasswordForEmail(accountEmail.value.trim(), {
            redirectTo: `${window.location.origin}/#profile`
        });
        if (error) return message(error.message, true);
        message("If an account exists for that email, a password reset link has been sent.");
    });

    document.getElementById("account-profile-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) return message("Please sign in again to save your profile.", true);
        try {
            await apiProfile(data.session, "PUT", { displayName: displayName.value.trim() });
            message("Player profile saved.");
        } catch (saveError) {
            message(saveError.message, true);
        }
    });

    document.getElementById("account-signout").addEventListener("click", async () => {
        const { error } = await client.auth.signOut();
        if (error) return message(error.message, true);
        await renderSession(null);
        message("You have been signed out.");
    });

    document.querySelectorAll("[data-account-open]").forEach((button) => {
        button.addEventListener("click", () => { window.location.hash = "#profile"; });
    });

    client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => renderSession(session), 0);
    });
    window.addEventListener("hashchange", async () => {
        if (window.location.hash !== "#my-games") return;
        const { data, error } = await client.auth.getSession();
        if (error) return message(error.message, true);
        if (!data.session) return;
        try { await loadMyGames(data.session); }
        catch (loadError) { message(loadError.message, true); }
    });

    client.auth.getSession().then(({ data, error }) => {
        if (error) message(error.message, true);
        return renderSession(data && data.session);
    });
})();
