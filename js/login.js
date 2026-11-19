"use strict";

/* =========================================================
   CATHERINE'S LOGIN PAGE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       LOGIN ELEMENTS
    ===================================================== */

    const loginForm =
        document.getElementById("loginForm");

    const emailInput =
        document.getElementById("email");

    const passwordInput =
        document.getElementById("password");

    const emailError =
        document.getElementById("emailError");

    const passwordError =
        document.getElementById("passwordError");

    const formStatus =
        document.getElementById("formStatus");


    /* =====================================================
       OTHER ELEMENTS
    ===================================================== */

    const togglePassword =
        document.getElementById("togglePassword");

    const forgotPassword =
        document.getElementById("forgotPassword");

    const createAccount =
        document.getElementById("createAccount");

    const backToResort =
        document.getElementById("backToResort");


    /* =====================================================
       BOOKING MODAL ELEMENTS
    ===================================================== */

    const bookingModal =
        document.getElementById("bookingModal");

    const bookingCodeBtn =
        document.getElementById("bookingCodeBtn");

    const closeBookingModal =
        document.getElementById("closeBookingModal");

    const bookingForm =
        document.getElementById("bookingForm");

    const bookingCode =
        document.getElementById("bookingCode");

    const bookingError =
        document.getElementById("bookingError");


    /* =====================================================
       HELPER FUNCTIONS
    ===================================================== */

    function clearLoginMessages() {

        if (emailError) {
            emailError.textContent = "";
        }

        if (passwordError) {
            passwordError.textContent = "";
        }

        if (formStatus) {
            formStatus.textContent = "";
            formStatus.className = "form-status";
        }

    }


    function isValidEmail(email) {

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    }


    function showStatus(message, type = "normal") {

        if (formStatus) {

            formStatus.innerHTML =
                message;

            if (type === "success") {
                formStatus.className = "form-status success-status";
            } else if (type === "error") {
                formStatus.className = "form-status error-status";
            } else {
                formStatus.className = "form-status";
            }

        }

    }


    /* =====================================================
       PASSWORD SHOW / HIDE
    ===================================================== */

    if (togglePassword && passwordInput) {

        togglePassword.addEventListener(
            "click",
            () => {

                const isPassword =
                    passwordInput.type === "password";


                if (isPassword) {

                    passwordInput.type =
                        "text";

                    togglePassword.textContent =
                        "◉";

                    togglePassword.setAttribute(
                        "aria-label",
                        "Hide password"
                    );

                }

                else {

                    passwordInput.type =
                        "password";

                    togglePassword.textContent =
                        "◌";

                    togglePassword.setAttribute(
                        "aria-label",
                        "Show password"
                    );

                }

            }
        );

    }


    /* =====================================================
       LOGIN FORM
    ===================================================== */

    let signingIn = false;
    if (loginForm) {

        loginForm.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();

                clearLoginMessages();


                /* =============================================
                   GET VALUES
                ============================================= */

                const email =
                    emailInput
                        ? emailInput.value.trim()
                        : "";

                const password =
                    passwordInput
                        ? passwordInput.value
                        : "";


                let valid = true;


                /* =============================================
                   EMAIL VALIDATION
                ============================================= */

                if (!email) {

                    if (emailError) {

                        emailError.textContent =
                            "Please enter your email address.";

                    }

                    valid = false;

                }

                else if (!isValidEmail(email)) {

                    if (emailError) {

                        emailError.textContent =
                            "Please enter a valid email address.";

                    }

                    valid = false;

                }


                /* =============================================
                   PASSWORD VALIDATION
                ============================================= */

                if (!password) {

                    if (passwordError) {

                        passwordError.textContent =
                            "Please enter your password.";

                    }

                    valid = false;

                }


                /* =============================================
                   STOP IF INVALID
                ============================================= */

                if (!valid) {
                    return;
                }


                /* =============================================
                   AUTHENTICATION VIA BUILT-IN RESORT DATABASE
                ============================================= */

                const rememberMeInput = document.getElementById("rememberMe");
                const isRemembered = rememberMeInput ? rememberMeInput.checked : false;

                if (signingIn) return;
                signingIn = true;
                const submit = loginForm.querySelector('[type="submit"]');
                if (submit) submit.disabled = true;
                try {
                    if (!window.SharedReservations) throw new Error("Shared sign-in is unavailable. Please retry.");
                    const signedIn = await window.SharedReservations.signIn(email, password, isRemembered);
                    const user = {
                        email: signedIn.user.email,
                        fullName: signedIn.user.displayName || "Guest",
                        role: signedIn.admin ? "admin" : "guest"
                    };
                    // Navigation hints only. Shared access always uses Firebase Auth.
                    if (window.ResortDB) window.ResortDB.saveSession(user, isRemembered);
                    showStatus("Signed in successfully. Redirecting...", "success");
                    setTimeout(() => {
                        const requestedReturn = new URL(window.location.href).searchParams.get("next");
                        const guestReturn = ["reservation.html", "my-reservation.html"].includes(requestedReturn) ? requestedReturn : "index.html";
                        window.location.href = signedIn.admin ? "admin-dashboard.html" : guestReturn;
                    }, 500);
                } catch (error) {
                    showStatus("Sign-in failed. Check your Firebase account email and password, then retry.", "error");
                    signingIn = false;
                    if (submit) submit.disabled = false;
                }

            }
        );

    }


    /* =====================================================
       RESTORE REMEMBER ME & CHECK SESSION EXPIRY ON LOAD
    ===================================================== */

    const rememberMeCheckbox = document.getElementById("rememberMe");
    if (rememberMeCheckbox) {
        const savedRemember = localStorage.getItem("rememberMe");
        if (savedRemember === "true") {
            rememberMeCheckbox.checked = true;
        }
    }

    /* =====================================================
       EMAILJS CONFIGURATION FOR PASSWORD RESET
       Replace placeholders with your actual EmailJS credentials:
       - PUBLIC_KEY: Found in Account > API Keys
       - SERVICE_ID: Found in Email Services (e.g. service_gmail / service_xxxx)
       - TEMPLATE_ID: Found in Email Templates (e.g. template_xxxx)
    ===================================================== */
    const EMAILJS_CONFIG = {
        PUBLIC_KEY: "qiKerR2jT2TV2n4eO",
        SERVICE_ID: "service_cse4f86",
        TEMPLATE_ID: "template_qmmtb1a"
    };

    // Initialize EmailJS if browser SDK is present & public key is set
    if (typeof emailjs !== "undefined" && EMAILJS_CONFIG.PUBLIC_KEY && EMAILJS_CONFIG.PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
        try {
            emailjs.init({
                publicKey: EMAILJS_CONFIG.PUBLIC_KEY
            });
        } catch (err) {
            console.error("EmailJS init failed:", err);
        }
    }

    /* =====================================================
       FORGOT PASSWORD MODAL & RESET FLOW
    ===================================================== */

    const forgotPasswordModal = document.getElementById("forgotPasswordModal");
    const closeForgotModal = document.getElementById("closeForgotModal");
    const forgotStep1Form = document.getElementById("forgotStep1Form");
    const forgotStep2Form = document.getElementById("forgotStep2Form");

    const resetEmailInput = document.getElementById("resetEmailInput");
    const resetEmailError = document.getElementById("resetEmailError");
    const resetCodeInput = document.getElementById("resetCodeInput");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
    const resetPasswordError = document.getElementById("resetPasswordError");
    const simulatedCodeBanner = document.getElementById("simulatedCodeBanner");

    let targetResetEmail = "";
    let activeResetCode = "CAT-8942";

    function openForgotModal() {
        if (!forgotPasswordModal) return;

        // Reset step forms
        if (forgotStep1Form) forgotStep1Form.style.display = "block";
        if (forgotStep2Form) forgotStep2Form.style.display = "none";
        if (resetEmailError) resetEmailError.textContent = "";
        if (resetPasswordError) resetPasswordError.textContent = "";

        // Pre-fill email if entered on login form
        if (emailInput && emailInput.value.trim() && resetEmailInput) {
            resetEmailInput.value = emailInput.value.trim();
        }

        forgotPasswordModal.classList.add("is-open");
        forgotPasswordModal.setAttribute("aria-hidden", "false");

        if (resetEmailInput) resetEmailInput.focus();
    }

    function closeForgotModalHandler() {
        if (!forgotPasswordModal) return;
        forgotPasswordModal.classList.remove("is-open");
        forgotPasswordModal.setAttribute("aria-hidden", "true");
        if (forgotStep1Form) forgotStep1Form.reset();
        if (forgotStep2Form) forgotStep2Form.reset();
    }

    if (forgotPassword) {
        forgotPassword.addEventListener("click", (e) => {
            e.preventDefault();
            openForgotModal();
        });
    }

    if (closeForgotModal) {
        closeForgotModal.addEventListener("click", closeForgotModalHandler);
    }

    const forgotBackdrop = document.querySelector("[data-close-forgot-modal]");
    if (forgotBackdrop) {
        forgotBackdrop.addEventListener("click", closeForgotModalHandler);
    }

    // The legacy reset-code flow changes local passwords only. Do not report
    // shared-account recovery success through that unrelated account store.
    for (const form of [forgotStep1Form, forgotStep2Form]) {
        if (form) form.addEventListener("submit", event => {
            event.preventDefault();
            const target = form === forgotStep1Form ? resetEmailError : resetPasswordError;
            if (target) target.textContent = "Shared-account password recovery is not available in this phase. Please contact the resort.";
        });
    }

    /* =====================================================
       CREATE ACCOUNT
    ===================================================== */

    if (createAccount) {

        createAccount.addEventListener(
            "click",
            (e) => {

                e.preventDefault();
                window.location.href = "register.html";

            }
        );

    }


    /* =====================================================
       BACK TO RESORT
    ===================================================== */

    if (backToResort) {

        backToResort.addEventListener(
            "click",
            () => {

                window.location.href =
                    "index.html";

            }
        );

    }


    /* =====================================================
       BOOKING CODE MODAL
    ===================================================== */

    function openBookingModal() {

        if (!bookingModal) {
            return;
        }


        bookingModal.classList.add(
            "is-open"
        );


        bookingModal.setAttribute(
            "aria-hidden",
            "false"
        );


        if (bookingCode) {
            bookingCode.focus();
        }

    }


    function closeBookingModalHandler() {

        if (!bookingModal) {
            return;
        }


        bookingModal.classList.remove(
            "is-open"
        );


        bookingModal.setAttribute(
            "aria-hidden",
            "true"
        );


        if (bookingError) {

            bookingError.textContent =
                "";

        }


        if (bookingForm) {
            bookingForm.reset();
        }

    }


    /* =====================================================
       OPEN BOOKING MODAL
    ===================================================== */

    if (bookingCodeBtn) {

        bookingCodeBtn.addEventListener(
            "click",
            openBookingModal
        );

    }


    /* =====================================================
       CLOSE BOOKING MODAL
    ===================================================== */

    if (closeBookingModal) {

        closeBookingModal.addEventListener(
            "click",
            closeBookingModalHandler
        );

    }


    /* =====================================================
       CLOSE BY CLICKING BACKDROP
    ===================================================== */

    const bookingBackdrop =
        document.querySelector(
            "[data-close-modal]"
        );


    if (bookingBackdrop) {

        bookingBackdrop.addEventListener(
            "click",
            closeBookingModalHandler
        );

    }


    /* =====================================================
       CLOSE WITH ESC KEY
    ===================================================== */

    document.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Escape" &&
                bookingModal &&
                bookingModal.classList.contains(
                    "is-open"
                )
            ) {

                closeBookingModalHandler();

            }

        }
    );


    /* =====================================================
       BOOKING CODE FORM
    ===================================================== */

    if (bookingForm) {
        bookingForm.addEventListener("submit", event => {
            event.preventDefault();
            if (bookingError) bookingError.textContent = "A booking reference does not sign you in. Please use your account email and password above.";
        });
    }

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    console.log(
        "Catherine's Login System initialized."
    );

});