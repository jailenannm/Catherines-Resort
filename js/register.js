"use strict";

/* =========================================================
   CATHERINE'S ACCOUNT REGISTRATION SCRIPT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       DOM ELEMENTS
    ===================================================== */

    const registerForm = document.getElementById("registerForm");
    const fullNameInput = document.getElementById("fullName");
    const phoneInput = document.getElementById("phoneNumber");
    const emailInput = document.getElementById("registerEmail");
    const passwordInput = document.getElementById("registerPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const agreeTermsInput = document.getElementById("agreeTerms");
    const subscribeNewsletterInput = document.getElementById("subscribeNewsletter");

    // Errors
    const fullNameError = document.getElementById("fullNameError");
    const phoneError = document.getElementById("phoneError");
    const emailError = document.getElementById("emailError");
    const passwordError = document.getElementById("passwordError");
    const confirmPasswordError = document.getElementById("confirmPasswordError");
    const formStatus = document.getElementById("formStatus");

    const termsError = document.getElementById("termsError");
    function consentError(message = "") {
        if (termsError) termsError.textContent = message;
        agreeTermsInput?.setAttribute("aria-invalid", String(Boolean(message)));
    }
    agreeTermsInput?.addEventListener("invalid", event => {
        event.preventDefault();
        consentError("Please agree to the Terms of Service and Privacy Policy to create an account.");
        agreeTermsInput.focus();
    });
    agreeTermsInput?.addEventListener("change", () => {
        if (agreeTermsInput.checked) consentError();
    });

    // Toggles
    const toggleRegisterPassword = document.getElementById("toggleRegisterPassword");
    const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

    // Password Strength & Requirements Elements
    const strengthContainer = document.getElementById("strengthContainer");
    const strengthFill = document.getElementById("strengthFill");
    const strengthLabel = document.getElementById("strengthLabel");

    const reqMinLen = document.getElementById("reqMinLen");
    const reqUpper = document.getElementById("reqUpper");
    const reqNumber = document.getElementById("reqNumber");
    const reqMatch = document.getElementById("reqMatch");

    // Links & Buttons
    const backToResort = document.getElementById("backToResort");
    const termsLink = document.getElementById("termsLink");
    const privacyLink = document.getElementById("privacyLink");

    // Booking Code Modal Elements
    const bookingModal = document.getElementById("bookingModal");
    const bookingCodeBtn = document.getElementById("bookingCodeBtn");
    const closeBookingModal = document.getElementById("closeBookingModal");
    const bookingForm = document.getElementById("bookingForm");
    const bookingCode = document.getElementById("bookingCode");
    const bookingError = document.getElementById("bookingError");


    /* =====================================================
       VALIDATION HELPERS
    ===================================================== */

    function clearErrors() {
        consentError();
        if (fullNameError) fullNameError.textContent = "";
        if (phoneError) phoneError.textContent = "";
        if (emailError) emailError.textContent = "";
        if (passwordError) passwordError.textContent = "";
        if (confirmPasswordError) confirmPasswordError.textContent = "";
        if (formStatus) {
            formStatus.textContent = "";
            formStatus.className = "form-status";
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function isValidPhone(phone) {
        // Simple international / Philippine phone validation (e.g. +63 9XX XXX XXXX or 09XXXXXXXXX)
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
        return /^(\+?\d{10,14})$/.test(cleanPhone);
    }

    function showStatus(message, type = "normal") {
        if (!formStatus) return;
        formStatus.textContent = message;
        if (type === "success") {
            formStatus.className = "form-status success-status";
        } else if (type === "error") {
            formStatus.className = "form-status error-status";
        } else {
            formStatus.className = "form-status";
        }
    }


    /* =====================================================
       PASSWORD VISIBILITY TOGGLES
    ===================================================== */

    function setupPasswordToggle(toggleBtn, inputEl) {
        if (!toggleBtn || !inputEl) return;

        toggleBtn.addEventListener("click", () => {
            const isPassword = inputEl.type === "password";
            if (isPassword) {
                inputEl.type = "text";
                toggleBtn.classList.add("is-visible");
                toggleBtn.setAttribute("aria-label", "Hide password");
            } else {
                inputEl.type = "password";
                toggleBtn.classList.remove("is-visible");
                toggleBtn.setAttribute("aria-label", "Show password");
            }
            toggleBtn.setAttribute("aria-pressed", String(isPassword));
        });
    }

    setupPasswordToggle(toggleRegisterPassword, passwordInput);
    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);


    /* =====================================================
       REAL-TIME PASSWORD STRENGTH & REQUIREMENTS CHECKER
    ===================================================== */

    function evaluatePassword() {
        const val = passwordInput ? passwordInput.value : "";
        const confirmVal = confirmPasswordInput ? confirmPasswordInput.value : "";

        if (val.length > 0 && strengthContainer) {
            strengthContainer.style.display = "block";
        } else if (strengthContainer) {
            strengthContainer.style.display = "none";
        }

        // Checks
        const hasMinLen = val.length >= 8;
        const hasUpper = /[A-Z]/.test(val) && /[a-z]/.test(val);
        const hasNumber = /[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val);
        const matches = val.length > 0 && val === confirmVal;

        // Update UI checklist
        if (reqMinLen) reqMinLen.classList.toggle("met", hasMinLen);
        if (reqUpper) reqUpper.classList.toggle("met", hasUpper);
        if (reqNumber) reqNumber.classList.toggle("met", hasNumber);
        if (reqMatch) reqMatch.classList.toggle("met", matches);

        // Strength Calculation
        let score = 0;
        if (val.length >= 8) score++;
        if (val.length >= 12) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        if (strengthFill && strengthLabel) {
            strengthFill.className = "strength-bar-fill";
            if (score <= 2) {
                strengthFill.classList.add("weak");
                strengthLabel.textContent = "Weak";
            } else if (score <= 4) {
                strengthFill.classList.add("medium");
                strengthLabel.textContent = "Medium";
            } else {
                strengthFill.classList.add("strong");
                strengthLabel.textContent = "Strong";
            }
        }
    }

    if (passwordInput) {
        passwordInput.addEventListener("input", evaluatePassword);
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener("input", evaluatePassword);
    }


    /* =====================================================
       REGISTER FORM SUBMISSION
    ===================================================== */

    let registering = false;
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            clearErrors();

            const fullName = fullNameInput ? fullNameInput.value.trim() : "";
            const phone = phoneInput ? phoneInput.value.trim() : "";
            const email = emailInput ? emailInput.value.trim() : "";
            const password = passwordInput ? passwordInput.value : "";
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";
            const agreeTerms = agreeTermsInput ? agreeTermsInput.checked : false;
            const subscribeOffers = subscribeNewsletterInput ? subscribeNewsletterInput.checked : false;

            let isValid = true;

            // 1. Full Name Validation
            if (!fullName) {
                if (fullNameError) fullNameError.textContent = "Please enter your full name.";
                isValid = false;
            } else if (fullName.length < 2) {
                if (fullNameError) fullNameError.textContent = "Please enter a valid full name.";
                isValid = false;
            }

            // 2. Phone Validation
            if (!phone) {
                if (phoneError) phoneError.textContent = "Please enter your mobile number.";
                isValid = false;
            } else if (!isValidPhone(phone)) {
                if (phoneError) phoneError.textContent = "Please enter a valid mobile number (e.g. +63 917 123 4567).";
                isValid = false;
            }

            // 3. Email Validation
            if (!email) {
                if (emailError) emailError.textContent = "Please enter your email address.";
                isValid = false;
            } else if (!isValidEmail(email)) {
                if (emailError) emailError.textContent = "Please enter a valid email address.";
                isValid = false;
            }

            // 4. Password Validation
            if (!password) {
                if (passwordError) passwordError.textContent = "Please create a password.";
                isValid = false;
            } else if (password.length < 8) {
                if (passwordError) passwordError.textContent = "Password must be at least 8 characters long.";
                isValid = false;
            }

            // 5. Confirm Password Validation
            if (!confirmPassword) {
                if (confirmPasswordError) confirmPasswordError.textContent = "Please confirm your password.";
                isValid = false;
            } else if (password !== confirmPassword) {
                if (confirmPasswordError) confirmPasswordError.textContent = "Passwords do not match.";
                isValid = false;
            }

            // 6. Terms Agreement
            if (!agreeTerms) {
                consentError("Please agree to the Terms of Service and Privacy Policy to create an account.");
                agreeTermsInput?.focus();
                isValid = false;
            }

            if (!isValid) return;

            if (registering) return;
            registering = true;
            const submitBtn = document.getElementById("submitRegisterBtn");
            if (submitBtn) submitBtn.disabled = true;
            try {
                if (!window.SharedReservations) throw new Error("Shared registration is unavailable.");
                const signedIn = await window.SharedReservations.register(email, password, fullName);
                if (window.ResortDB) window.ResortDB.saveSession({ fullName, email, phone, role: signedIn.admin ? "admin" : "guest" }, false);
                showStatus("Sanctuary account created successfully. Signing you in...", "success");
                setTimeout(() => { window.location.href = "index.html"; }, 1200);
            } catch (error) {
                const code = /^auth\/[a-z0-9-]{1,80}$/.test(error?.code || "") ? error.code : "registration/unknown-error";
                const hints = {
                    "auth/operation-not-allowed": "Enable Email/Password in Firebase Authentication > Sign-in method for atherines-resort-reservations.",
                    "auth/admin-restricted-operation": "Check whether end-user account creation is disabled in the reservations project's Authentication settings.",
                    "auth/email-already-in-use": "This email already has an account. Please sign in.",
                    "auth/weak-password": "Choose a password that meets the project's password policy.",
                    "auth/password-does-not-meet-requirements": "Choose a password that meets the project's password policy.",
                    "auth/invalid-email": "Check the email address and try again.",
                    "auth/network-request-failed": "Check the connection or request blocking, then retry.",
                    "auth/unauthorized-domain": "Check Authentication > Settings > Authorized domains for this host.",
                    "auth/too-many-requests": "Firebase temporarily limited requests. Please wait before retrying.",
                    "auth/invalid-api-key": "Check the reservations web app API key and its restrictions."
                };
                const context = { appName: "shared-reservations", projectId: window.SHARED_RESERVATIONS_CONFIG?.firebaseConfig?.projectId || "unavailable", mode: window.SHARED_RESERVATIONS_CONFIG?.mode || "unavailable" };
                try { Object.assign(context, window.SharedReservations.registrationContext()); } catch { /* Configuration/SDK may be unavailable. */ }
                const stages = ["initialize", "session-persistence", "create-account", "profile", "verify-session"];
                // Intentionally log ONLY these fields, never error itself, input
                // values, passwords, tokens, URLs, SDK customData or raw messages.
                console.warn("Registration failed", {
                    code, appName: context.appName, projectId: context.projectId, mode: context.mode,
                    stage: stages.includes(error?.registrationStage) ? error.registrationStage : "unavailable"
                });
                const message = error?.accountCreated === true
                    ? "Your Firebase account was created, but setup did not finish. Please sign in."
                    : "Account creation failed. " + (hints[code] || "Please retry or contact the resort with this error code.");
                showStatus(message + " (" + code + ")", "error");
                registering = false;
                if (submitBtn) submitBtn.disabled = false;
            }

        });
    }


    /* =====================================================
       BACK TO RESORT & TERMS/PRIVACY HANDLERS
    ===================================================== */

    if (backToResort) {
        backToResort.addEventListener("click", () => {
            window.location.href = "index.html";
        });
    }

    // Native modal dialogs make the background inert. Explicit wrapping also
    // keeps Tab/Shift+Tab inside the policy and returns focus to its own opener.
    function setupPolicyDialog(link, id) {
        const dialog = document.getElementById(id);
        if (!link || !dialog) return;
        let opener;
        link.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            opener = link;
            dialog.showModal();
            dialog.querySelector("[data-close-policy]").focus();
        });
        dialog.querySelector("[data-close-policy]").addEventListener("click", () => dialog.close());
        dialog.addEventListener("cancel", event => { event.preventDefault(); dialog.close(); });
        dialog.addEventListener("close", () => opener?.focus());
        dialog.addEventListener("keydown", event => {
            if (event.key !== "Tab") return;
            const targets = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')];
            const first = targets[0], last = targets[targets.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
    }
    setupPolicyDialog(termsLink, "termsPolicy");
    setupPolicyDialog(privacyLink, "privacyPolicy");



    /* =====================================================
       BOOKING CODE MODAL HANDLERS
    ===================================================== */

    function openBookingModal() {
        if (!bookingModal) return;
        bookingModal.classList.add("is-open");
        bookingModal.setAttribute("aria-hidden", "false");
        if (bookingCode) bookingCode.focus();
    }

    function closeBookingModalHandler() {
        if (!bookingModal) return;
        bookingModal.classList.remove("is-open");
        bookingModal.setAttribute("aria-hidden", "true");
        if (bookingError) bookingError.textContent = "";
        if (bookingForm) bookingForm.reset();
    }

    if (bookingCodeBtn) {
        bookingCodeBtn.addEventListener("click", openBookingModal);
    }

    if (closeBookingModal) {
        closeBookingModal.addEventListener("click", closeBookingModalHandler);
    }

    const bookingBackdrop = document.querySelector("[data-close-modal]");
    if (bookingBackdrop) {
        bookingBackdrop.addEventListener("click", closeBookingModalHandler);
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && bookingModal && bookingModal.classList.contains("is-open")) {
            closeBookingModalHandler();
        }
    });

    if (bookingForm) {
        bookingForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const code = bookingCode ? bookingCode.value.trim().toUpperCase() : "";
            if (bookingError) bookingError.textContent = "";

            if (!code) {
                if (bookingError) bookingError.textContent = "Please enter your booking code.";
                return;
            }

            if (bookingError) {
                bookingError.textContent = "Booking-code verification will be connected to the reservation database next.";
            }
        });
    }

});
