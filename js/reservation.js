"use strict";


/* =========================================================
   CATHERINE'S BAGASBAS LIGHTHOUSE RESORT
   RESERVATION PAGE JAVASCRIPT
========================================================= */


/* =========================================================
   AUTHENTICATION
========================================================= */

const publicHeader = document.querySelector('[data-public-header]');
const reservationData = {

    adults: 2,

    children: 0,

    senior: 0,

    facilities: []

};


/* =========================================================
   DOM ELEMENTS
========================================================= */

const checkinDate =
    document.getElementById(
        "checkinDate"
    );


const stayDuration =
    document.getElementById(
        "stayDuration"
    );


const fullName =
    document.getElementById(
        "fullName"
    );


const mobileNumber =
    document.getElementById(
        "mobileNumber"
    );


const emailAddress =
    document.getElementById(
        "emailAddress"
    );


const specialRequests =
    document.getElementById(
        "specialRequests"
    );


/* =========================================================
   SET MINIMUM CHECK-IN DATE
========================================================= */

function setMinimumDate() {

    if (!checkinDate) {
        return;
    }


    const today =
        new Date();


    const year =
        today.getFullYear();


    const month =
        String(
            today.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            today.getDate()
        ).padStart(
            2,
            "0"
        );


    const formattedDate =
        `${year}-${month}-${day}`;


    checkinDate.min =
        formattedDate;


    /*
        Only set today's date when the
        field doesn't already contain one.
    */

    if (!checkinDate.value) {

        checkinDate.value =
            formattedDate;

    }

}


setMinimumDate();


/* =========================================================
   LOAD PENDING RESERVATION FROM INDEX
========================================================= */

function loadPendingReservation() {

    try {
        const saved =
            sessionStorage.getItem(
                "pendingReservation"
            );

        if (!saved) {
            return;
        }


        const pending =
            JSON.parse(
                saved
            );


        /*
            Date
        */

        if (
            pending.date &&
            checkinDate
        ) {

            checkinDate.value =
                pending.date;

        }


        /*
            Duration
        */

        if (
            pending.duration &&
            stayDuration
        ) {

            const options =
                Array.from(
                    stayDuration.options
                );


            const matchingOption =
                options.find(
                    option =>
                        option.value ===
                        pending.duration ||
                        option.textContent.trim() ===
                        pending.duration
                );


            if (
                matchingOption
            ) {

                stayDuration.value =
                    matchingOption.value;

            }

        }


        /*
            Guest count
        */

        if (typeof pending.guests === 'string') {
            // A homepage range is a preference, never an exact party count.
            if (/^\d+$/.test(pending.guests) && Number(pending.guests) > 0) { reservationData.adults = Number(pending.guests); sessionStorage.removeItem('reservationGuestRangePreference'); }
            else if (/^\d+\s*[–-]\s*\d+\s+Guests$|^\d+\+\s+Guests$/i.test(pending.guests)) {
                sessionStorage.setItem('reservationGuestRangePreference', pending.guests);
            }
        }

        /*
            Facility / quarters
        */

        if (
            pending.quarters
        ) {

            selectMatchingFacility(
                pending.quarters
            );

        }


        /*
            Remove the pending
            data after loading.
        */

        sessionStorage.removeItem(
            "pendingReservation"
        );

    }
    catch (error) {

        console.error(
            "Could not load pending reservation:",
            error
        );

    }

}


/* =========================================================
   SELECT FACILITY FROM INDEX DATA
========================================================= */

function selectMatchingFacility(
    quarters
) {

    const normalized =
        String(
            quarters
        )
        .toLowerCase();


    let targetValue =
        null;


    if (
        normalized.includes(
            "cottage"
        )
    ) {

        targetValue =
            "cottage";

    }
    else if (
        normalized.includes(
            "pool"
        ) ||
        normalized.includes(
            "bridge"
        )
    ) {

        targetValue =
            "pool";

    }
    else if (
        normalized.includes(
            "ktv"
        )
    ) {

        targetValue =
            "ktv";

    }
    else if (
        normalized.includes(
            "celebration"
        ) ||
        normalized.includes(
            "event"
        )
    ) {

        targetValue =
            "event";

    }
    else if (
        normalized.includes(
            "buyout"
        )
    ) {

        targetValue =
            "buyout";

    }


    if (!targetValue) {
        return;
    }


    const checkbox =
        document.querySelector(
            `input[name="facility"][value="${targetValue}"]`
        );


    if (!checkbox) {
        return;
    }

    // An explicit homepage choice replaces form defaults; it is not an add-on.
    document.querySelectorAll('input[name="facility"]').forEach(input => { input.checked = input === checkbox; });

    checkbox.checked =
        true;


    checkbox
        .closest(
            ".facility-option"
        )
        ?.classList.add(
            "selected"
        );

}


/* =========================================================
   GUEST COUNTERS
========================================================= */

const counterButtons =
    document.querySelectorAll(
        ".counter-button"
    );


counterButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                const counter =
                    button.dataset.counter;


                const action =
                    button.dataset.action;


                if (
                    !Object.prototype.hasOwnProperty.call(
                        reservationData,
                        counter
                    )
                ) {

                    return;

                }


                if (
                    action === "plus"
                ) {

                    reservationData[counter]++;

                }


                if (
                    action === "minus"
                ) {

                    reservationData[counter]--;

                }


                /*
                    Minimum of one adult.
                */

                if (
                    counter === "adults" &&
                    reservationData.adults < 1
                ) {

                    reservationData.adults =
                        1;

                }


                /*
                    Children cannot go below 0.
                */

                if (
                    counter === "children" &&
                    reservationData.children < 0
                ) {

                    reservationData.children =
                        0;

                }


                /*
                    Senior/PWD cannot go below 0.
                */

                if (
                    counter === "senior" &&
                    reservationData.senior < 0
                ) {

                    reservationData.senior =
                        0;

                }


                updateGuestCounters();

                updateSummary();

            }
        );

    }
);


/* =========================================================
   UPDATE GUEST COUNTER DISPLAY
========================================================= */

function updateGuestCounters() {

    const adultCount =
        document.getElementById(
            "adultCount"
        );


    const childrenCount =
        document.getElementById(
            "childrenCount"
        );


    const seniorCount =
        document.getElementById(
            "seniorCount"
        );


    if (adultCount) {

        adultCount.textContent =
            reservationData.adults;

    }


    if (childrenCount) {

        childrenCount.textContent =
            reservationData.children;

    }


    if (seniorCount) {

        seniorCount.textContent =
            reservationData.senior;

    }

}


/* =========================================================
   FACILITY SELECTION
========================================================= */

const facilityOptions =
    document.querySelectorAll(
        ".facility-option"
    );


facilityOptions.forEach(
    option => {

        const checkbox =
            option.querySelector(
                'input[name="facility"]'
            );


        if (!checkbox) {
            return;
        }


        checkbox.addEventListener(
            "change",
            () => {

                /*
                    FULL BUYOUT
                    is mutually exclusive.
                */

                if (
                    checkbox.value ===
                    "buyout" &&
                    checkbox.checked
                ) {

                    document
                        .querySelectorAll(
                            'input[name="facility"]'
                        )
                        .forEach(
                            other => {

                                if (
                                    other !==
                                    checkbox
                                ) {

                                    other.checked =
                                        false;


                                    other
                                        .closest(
                                            ".facility-option"
                                        )
                                        ?.classList
                                        .remove(
                                            "selected"
                                        );

                                }

                            }
                        );

                }


                /*
                    Selecting any regular facility
                    removes buyout.
                */

                if (
                    checkbox.value !==
                    "buyout" &&
                    checkbox.checked
                ) {

                    const buyout =
                        document.querySelector(
                            'input[name="facility"][value="buyout"]'
                        );


                    if (
                        buyout &&
                        buyout.checked
                    ) {

                        buyout.checked =
                            false;


                        buyout
                            .closest(
                                ".facility-option"
                            )
                            ?.classList.remove(
                                "selected"
                            );

                    }

                }


                option.classList.toggle(
                    "selected",
                    checkbox.checked
                );


                updateFacilities();

                updateSummary();

            }
        );

    }
);


/* =========================================================
   GET FACILITY NAME
========================================================= */

function getFacilityName(
    value
) {

    const names = {

        cottage:
            "Private Seaside Cottage",

        pool:
            "Swimming Pool & Arched Bridge",

        ktv:
            "Lighthouse KTV Lounge",

        event:
            "Celebration Event Package — Event Place, Swimming Pool & Stage Band",

        buyout:
            "Full Catherine's Resort Buyout"

    };


    return (
        names[value] ||
        value
    );

}


/* =========================================================
   UPDATE SELECTED FACILITIES
========================================================= */

function normalizeEventSelection() {
    const event = document.querySelector('input[name="facility"][value="event"]');
    const pool = document.querySelector('input[name="facility"][value="pool"]');
    if (!event || !pool) return;
    if (event.checked) pool.checked = false;
    pool.disabled = event.checked;
    pool.closest('.facility-option')?.classList.toggle('selected', pool.checked);
    const note = document.getElementById('eventPoolIncluded');
    if (note) note.hidden = !event.checked;
}
function updateFacilities() {
    normalizeEventSelection();
    document.querySelectorAll('input[name="facility"]').forEach(input => {
        const card = input.closest('.facility-option');
        card.classList.toggle('selected', input.checked);
        card.classList.toggle('included', input.disabled && input.value === 'pool');
        const state = card.querySelector('.facility-selection-state');
        if (state) state.textContent = input.disabled
            ? (input.value === 'pool' ? 'Included in Event' : 'Unavailable')
            : (input.checked ? 'Selected' : 'Select');
    });

    reservationData.facilities =
        [];


    const selected =
        document.querySelectorAll(
            'input[name="facility"]:checked'
        );


    selected.forEach(
        checkbox => {

            const price =
                Number(
                    checkbox.dataset.price
                );


            reservationData.facilities.push({
                ...(checkbox.value === "event" ? { packageVersion: 2 } : {}),

                name:
                    getFacilityName(
                        checkbox.value
                    ),

                price:
                    Number.isFinite(
                        price
                    )
                        ? price
                        : 0,

                value:
                    checkbox.value

            });

        }
    );

}


/* =========================================================
   CALCULATE PRICE
========================================================= */

function calculatePrices() {

    const subtotal =
        reservationData.facilities.reduce(
            (
                total,
                facility
            ) => {

                return (
                    total +
                    facility.price
                );

            },
            0
        );


    /*
        Demo tax value based on the
        current reservation design.
    */

    const tourismTax =
        subtotal > 0
            ? 250
            : 0;


    /*
        8% resort service charge.
    */

    const serviceCharge =
        subtotal *
        0.08;


    const total =
        subtotal +
        tourismTax +
        serviceCharge;


    return {

        subtotal,

        tourismTax,

        serviceCharge,

        total

    };

}


/* =========================================================
   CURRENCY FORMAT
========================================================= */

function formatCurrency(
    amount
) {

    const safeAmount =
        Number.isFinite(
            amount
        )
            ? amount
            : 0;


    return (
        "₱" +
        safeAmount.toLocaleString(
            "en-PH",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )
    );

}


/* =========================================================
   GET TOTAL GUESTS
========================================================= */

function getTotalGuests() {

    return (
        reservationData.adults +
        reservationData.children +
        reservationData.senior
    );

}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatReservationDate(
    value
) {

    if (!value) {

        return "Select date";

    }


    const date =
        new Date(
            `${value}T00:00:00`
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Select date";

    }


    return date.toLocaleDateString(
        "en-PH",
        {
            month:
                "long",

            day:
                "numeric",

            year:
                "numeric"
        }
    );

}


/* =========================================================
   UPDATE SUMMARY SIDEBAR
========================================================= */

function updateSummary() {
    const slot = window.BookingSlots?.[stayDuration?.value];
    const slotLabel = document.getElementById("staySlotLabel");
    const summarySlot = document.getElementById("summaryDuration");
    if (slotLabel) slotLabel.textContent = slot?.label || "Select a stay slot.";
    if (summarySlot) summarySlot.textContent = slot?.label || "Select a stay slot.";

    updateFacilities();



    const prices =
        calculatePrices();


    /*
        Guest count
    */

    const totalGuests =
        getTotalGuests();


    const summaryGuestCount =
        document.getElementById(
            "summaryGuestCount"
        );


    if (
        summaryGuestCount
    ) {

        summaryGuestCount.textContent =
            `${totalGuests} Guest${totalGuests !== 1 ? "s" : ""}`;

    }


    /*
        Guest name
    */

    const summaryGuestName =
        document.getElementById(
            "summaryGuestName"
        );


    if (
        summaryGuestName
    ) {

        summaryGuestName.textContent =
            fullName &&
            fullName.value.trim()
                ? fullName.value.trim()
                : "Guest";

    }


    /*
        Date
    */

    const summaryDate =
        document.getElementById(
            "summaryDate"
        );


    if (
        summaryDate
    ) {

        summaryDate.textContent =
            formatReservationDate(
                checkinDate
                    ? checkinDate.value
                    : ""
            );

    }


    /*
        Subtotal
    */

    const subtotal =
        document.getElementById(
            "subtotal"
        );


    if (subtotal) {

        subtotal.textContent =
            formatCurrency(
                prices.subtotal
            );

    }


    /*
        Tax
    */

    const tax =
        document.getElementById(
            "tax"
        );


    if (tax) {

        tax.textContent =
            formatCurrency(
                prices.tourismTax
            );

    }


    /*
        Service charge
    */

    const serviceCharge =
        document.getElementById(
            "serviceCharge"
        );


    if (serviceCharge) {

        serviceCharge.textContent =
            formatCurrency(
                prices.serviceCharge
            );

    }


    /*
        Total
    */

    const totalPrice =
        document.getElementById(
            "totalPrice"
        );


    if (totalPrice) {

        totalPrice.textContent =
            formatCurrency(
                prices.total
            );

    }


    /*
        Summary facilities
    */

    const summaryFacilities =
        document.getElementById(
            "summaryFacilities"
        );


    if (
        summaryFacilities
    ) {

        if (
            reservationData.facilities.length === 0
        ) {

            summaryFacilities.innerHTML = `
                <div>
                    <span>
                        No facilities selected
                    </span>

                    <strong>
                        ₱0
                    </strong>
                </div>
            `;

        }
        else {

            summaryFacilities.innerHTML =
                reservationData.facilities
                    .map(
                        facility => `
                            <div>

                                <span>
                                    ${escapeHtml(
                                        facility.name
                                    )}
                                </span>

                                <strong>
                                    ${formatCurrency(
                                        facility.price
                                    )}
                                </strong>

                            </div>
                        `
                    )
                    .join("");

        }

    }

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   INPUT EVENTS
========================================================= */

[
    checkinDate,

    stayDuration,

    fullName,

    mobileNumber,

    emailAddress,

    specialRequests
]
.forEach(
    element => {

        if (!element) {
            return;
        }


        element.addEventListener(
            "input",
            () => {

                updateSummary();

            }
        );


        element.addEventListener(
            "change",
            () => {

                updateSummary();

            }
        );

    }
);


/* =========================================================
   PAGE SECTION NAVIGATION
========================================================= */

const nextButtons =
    document.querySelectorAll(
        ".next-step"
    );


const previousButtons =
    document.querySelectorAll(
        ".previous-step"
    );


const progressSteps =
    document.querySelectorAll(
        ".progress-step"
    );


/* =========================================================
   UPDATE PROGRESS BAR
========================================================= */

const completedSteps = new Set();
let activeProgressStep = 1;
const progressBar = document.querySelector('.progress-section');
const compactProgress = document.createElement('p');
compactProgress.className = 'progress-compact';
compactProgress.setAttribute('aria-live', 'polite');
progressBar.prepend(compactProgress);
function progressOffset() {
    return (publicHeader?.getBoundingClientRect().height || 0) + progressBar.getBoundingClientRect().height + 16;
}
function updateProgress(currentStep = activeProgressStep) {
    activeProgressStep = currentStep;
    progressSteps.forEach(step => {
        const number = Number(step.dataset.step);
        const complete = completedSteps.has(number);
        step.classList.toggle('completed', complete);
        step.classList.toggle('active', number === currentStep);
        if (number === currentStep) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
        step.querySelector('.step-circle').textContent = complete ? '\u2713' : number;
        step.setAttribute('aria-label', 'Step ' + number + ': ' + step.querySelector('strong').textContent.trim() + (complete ? ', completed' : ''));
    });
    compactProgress.textContent = 'Step ' + currentStep + ' of 4 \u00b7 ' + progressSteps[currentStep - 1].querySelector('strong').textContent.trim();
}
function invalidateProgress(from) {
    for (let step = from; step <= 4; step++) completedSteps.delete(step);
    updateProgress();
}
function validateProgressStep(step) {
    if (!validateStep(step)) { invalidateProgress(step); scrollToStep(step); return false; }
    completedSteps.add(step);
    updateProgress();
    return true;
}
const progressResize = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--reservation-progress-height', progressBar.getBoundingClientRect().height + 'px');
});
progressResize.observe(progressBar);
document.querySelectorAll('.reservation-step').forEach(section => {
    ['input', 'change'].forEach(event => section.addEventListener(event, () => invalidateProgress(Number(section.dataset.stepContent))));
    section.querySelectorAll('.counter-button').forEach(button => button.addEventListener('click', () => invalidateProgress(1)));
});

/* =========================================================
   SCROLL TO RESERVATION SECTION
========================================================= */

function scrollToStep(
    stepNumber
) {

    const sectionMap = {

        1:
            "schedule-section",

        2:
            "guest-information-section",

        3:
            "facility-selection-section",

        4:
            "review-section"

    };


    const targetId =
        sectionMap[stepNumber];


    if (!targetId) {
        return;
    }


    const target =
        document.getElementById(
            targetId
        );


    if (!target) {
        return;
    }


    /*
        Approximate sticky header
        offset.
    */

    updateProgress(stepNumber);
    const offset = progressOffset();


    const targetPosition =
        target.getBoundingClientRect().top +
        window.scrollY -
        offset;


    window.scrollTo({

        top:
            Math.max(
                targetPosition,
                0
            ),

        behavior:
            "instant"

    });


    updateProgress(
        stepNumber
    );

}


/* =========================================================
   VALIDATE STEP
========================================================= */

function validateStep(
    step
) {

    /*
        STEP 1
    */

    if (
        step === 1
    ) {

        if (
            !checkinDate ||
            !checkinDate.value
        ) {

            alert(
                "Please select your check-in date."
            );


            if (checkinDate) {

                checkinDate.focus();

            }


            return false;

        }


        if (
            reservationData.adults < 1
        ) {

            alert(
                "At least one adult guest is required."
            );


            return false;

        }


        return true;

    }


    /*
        STEP 2
    */

    if (
        step === 2
    ) {

        if (
            !fullName ||
            !fullName.value.trim()
        ) {

            alert(
                "Please enter the primary guest's full legal name."
            );


            if (fullName) {

                fullName.focus();

            }


            return false;

        }


        if (
            !mobileNumber ||
            !mobileNumber.value.trim()
        ) {

            alert(
                "Please enter a mobile number."
            );


            if (mobileNumber) {

                mobileNumber.focus();

            }


            return false;

        }


        if (
            !emailAddress ||
            !emailAddress.value.trim()
        ) {

            alert(
                "Please enter an email address."
            );


            if (emailAddress) {

                emailAddress.focus();

            }


            return false;

        }


        if (
            emailAddress &&
            !emailAddress.checkValidity()
        ) {

            alert(
                "Please enter a valid email address."
            );


            emailAddress.focus();


            return false;

        }


        return true;

    }


    /*
        STEP 3
    */

    if (
        step === 3
    ) {

        updateFacilities();


        if (
            reservationData.facilities.length === 0
        ) {

            alert(
                "Please select at least one facility or experience."
            );


            return false;

        }


        return true;

    }


    return true;

}


/* =========================================================
   NEXT BUTTON EVENTS
========================================================= */

nextButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                const currentSection =
                    button.closest(
                        ".reservation-step"
                    );


                if (!currentSection) {
                    return;
                }


                const currentStep =
                    Number(
                        currentSection.dataset
                            .stepContent
                    );


                const nextStep =
                    Number(
                        button.dataset.next
                    );


                /*
                    Stop when validation fails.
                */

                if (
                    !validateProgressStep(
                        currentStep
                    )
                ) {

                    return;

                }


                /*
                    Prepare review
                    before entering Step 4.
                */

                if (
                    nextStep === 4
                ) {

                    prepareReview();

                }


                scrollToStep(
                    nextStep
                );

            }
        );

    }
);


/* =========================================================
   PREVIOUS BUTTON EVENTS
========================================================= */

previousButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                const previousStep =
                    Number(
                        button.dataset.previous
                    );


                scrollToStep(
                    previousStep
                );

            }
        );

    }
);


/* =========================================================
   PROGRESS STEP CLICK
========================================================= */

progressSteps.forEach(step => {
    step.setAttribute('role', 'button');
    step.tabIndex = 0;
    step.setAttribute('aria-controls', document.querySelector('[data-step-content="' + step.dataset.step + '"]').id);
    const navigate = () => {
        const destination = Number(step.dataset.step);
        if (destination > activeProgressStep) {
            for (let number = 1; number < destination; number++) {
                if (!validateProgressStep(number)) return;
            }
        }
        if (destination === 4) prepareReview();
        scrollToStep(destination);
    };
    step.addEventListener('click', navigate);
    step.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(); }
    });
});
// The form's navigation owns the active step. Scrolling alone never validates a step.

/* =========================================================
   PREPARE REVIEW
========================================================= */

function prepareReview() {

    updateFacilities();


    /*
        DATE
    */

    const reviewDate =
        document.getElementById(
            "reviewDate"
        );


    if (reviewDate) {

        reviewDate.textContent =
            formatReservationDate(
                checkinDate
                    ? checkinDate.value
                    : ""
            );

    }


    /*
        DURATION
    */

    const reviewDuration =
        document.getElementById(
            "reviewDuration"
        );


    if (
        reviewDuration &&
        stayDuration
    ) {

        const selected =
            stayDuration
                .selectedOptions[0];


        reviewDuration.textContent =
            selected
                ? (window.BookingSlots?.[stayDuration.value]?.label || selected.textContent.trim())
                : "—";

    }


    /*
        GUESTS
    */

    const reviewGuests =
        document.getElementById(
            "reviewGuests"
        );


    if (reviewGuests) {

        const totalGuests =
            getTotalGuests();


        reviewGuests.textContent =
            `${totalGuests} total — ` +
            `${reservationData.adults} adults, ` +
            `${reservationData.children} children, ` +
            `${reservationData.senior} senior/PWD`;

    }


    /*
        PRIMARY GUEST
    */

    const reviewGuestName =
        document.getElementById(
            "reviewGuestName"
        );


    if (reviewGuestName) {

        reviewGuestName.textContent =
            fullName &&
            fullName.value.trim()
                ? fullName.value.trim()
                : "—";

    }


    /*
        EMAIL
    */

    const reviewEmail =
        document.getElementById(
            "reviewEmail"
        );


    if (reviewEmail) {

        reviewEmail.textContent =
            emailAddress &&
            emailAddress.value.trim()
                ? emailAddress.value.trim()
                : "—";

    }


    /*
        FACILITIES
    */

    const reviewFacilities =
        document.getElementById(
            "reviewFacilities"
        );


    if (!reviewFacilities) {
        return;
    }


    if (
        reservationData.facilities.length === 0
    ) {

        reviewFacilities.innerHTML = `
            <p>
                No facilities selected.
            </p>
        `;

        return;

    }


    reviewFacilities.innerHTML =
        reservationData.facilities
            .map(
                facility => `

                    <div
                        class="review-facility-item"
                    >

                        <span>
                            ${escapeHtml(
                                facility.name
                            )}
                        </span>

                        <strong>
                            ${formatCurrency(
                                facility.price
                            )}
                        </strong>

                    </div>

                `
            )
            .join("");

}


/* =========================================================
   SAVE RESERVATION DATA
========================================================= */

function buildReservationObject(
    reference
) {
    if (!window.BookingSlots?.[stayDuration?.value]) throw new Error("Please select a valid stay slot.");
    if (reservationData.facilities.some(f => f.value === "event") && reservationData.facilities.some(f => f.value === "pool")) throw new Error("Pool is included in Event; remove the separate Pool charge.");

    const prices =
        calculatePrices();


    return {

        reference,

        checkinDate:
            checkinDate
                ? checkinDate.value
                : "",

        staySlotId: stayDuration ? stayDuration.value : "",
        duration: window.BookingSlots?.[stayDuration?.value]?.label || "",

        adults:
            reservationData.adults,

        children:
            reservationData.children,

        senior:
            reservationData.senior,

        totalGuests:
            getTotalGuests(),

        honorific:
            document.getElementById(
                "honorific"
            )?.value || "",

        guestName:
            fullName
                ? fullName.value.trim()
                : "",

        mobile:
            mobileNumber
                ? mobileNumber.value.trim()
                : "",

        email:
            emailAddress
                ? emailAddress.value.trim()
                : "",

        specialRequests:
            specialRequests
                ? specialRequests.value.trim()
                : "",

        facilities:
            reservationData.facilities,

        prices,

        status:
            "Pending Verification",

        createdAt:
            new Date().toISOString()

    };

}


/* =========================================================
   CONFIRM RESERVATION
========================================================= */

const confirmButton =
    document.getElementById(
        "confirmReservation"
    );


const successModal =
    document.getElementById(
        "successModal"
    );


const confirmationNumber =
    document.getElementById(
        "confirmationNumber"
    );


let reservationSubmitLock = false;
let reservationAttempt = null;
let lastSavedReservation = null;
let confirmationEmailSentFor = "";


async function generateUniqueReservationReference() {
    if (!window.SharedReservations) throw new Error("Shared reservations are unavailable. Please retry.");
    return window.SharedReservations.generateReference();
}


function showReservationSaveError(message) {

    alert(
        message ||
        "Reservation could not be saved. Please try again. Your form details have been kept."
    );

}


function isCloudReservationTest() { return window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true; }
function reservationConfirmationDestination() {
    return lastSavedReservation?.reference
        ? "my-reservation.html?reservation=" + encodeURIComponent(lastSavedReservation.reference)
        : "guest-dashboard.html";
}
function presentReservationConfirmation(saved) {
    completedSteps.add(4);
    updateProgress(4);
    if (closeModal) closeModal.textContent = "View Reservation";

    if (
        confirmationNumber &&
        saved &&
        saved.reference
    ) {
        confirmationNumber.textContent =
            saved.reference;
    }

    if (successModal) {
        successModal.classList.add("show");
        document.body.style.overflow = "hidden";
    }

}


function sendConfirmationEmailOnce(saved) {

    if (!window.SharedReservations?.emailEnabled || !saved || !saved.reference) {
        return;
    }

    if (confirmationEmailSentFor === saved.reference) {
        return;
    }

    try {
        sendReservationConfirmationEmail(saved);
        confirmationEmailSentFor = saved.reference;
    } catch (emailErr) {
        console.error(
            "Failed to send reservation confirmation email:",
            emailErr
        );
    }

}


if (confirmButton) {

    confirmButton.addEventListener(
        "click",
        async () => {

            if (reservationSubmitLock) {
                return;
            }

            /*
                Validate every required
                section before confirming.
            */

            if (
                !validateProgressStep(1)
            ) {

                scrollToStep(1);

                return;

            }


            if (
                !validateProgressStep(2)
            ) {

                scrollToStep(2);

                return;

            }


            if (
                !validateProgressStep(3)
            ) {

                scrollToStep(3);

                return;

            }


            /*
                Terms
            */

            const terms =
                document.getElementById(
                    "agreeTerms"
                );


            if (
                !terms ||
                !terms.checked
            ) {

                alert(
                    "Please confirm that you agree to the reservation terms before continuing."
                );


                if (terms) {

                    terms.focus();

                }


                scrollToStep(4);

                return;

            }


            reservationSubmitLock = true;
            confirmButton.disabled = true;

            try {
                if (!window.SharedReservations) throw new Error("Shared reservations are unavailable. Please retry.");
                const { user } = await window.SharedReservations.identity();
                if (
                    lastSavedReservation &&
                    lastSavedReservation.reference &&
                    lastSavedReservation.ownerUid === user.uid
                ) {
                    presentReservationConfirmation(lastSavedReservation);
                    sendConfirmationEmailOnce(lastSavedReservation);
                    return;
                }

                const hadReservationAttempt = Boolean(reservationAttempt);
                if (reservationAttempt && window.SharedReservations.recoverReservationAttempt) {
                    const recovered = await window.SharedReservations.recoverReservationAttempt(reservationAttempt);
                    if (recovered) { lastSavedReservation = recovered; presentReservationConfirmation(recovered); sendConfirmationEmailOnce(recovered); return; }
                }
                if (!reservationAttempt) {
                    reservationAttempt = buildReservationObject(
                        await generateUniqueReservationReference()
                    );
                    reservationAttempt.ownerUid = user.uid;
                    // Retain this snapshot and identity across uncertain saves/retries.
                    reservationAttempt.submissionAttemptId =
                        window.crypto?.randomUUID?.() ||
                        Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
                }

                const availability = await window.ReservationCalendar?.verifyBeforeSubmit(reservationAttempt);
                if (availability?.status === "unavailable") { if (!hadReservationAttempt) reservationAttempt = null; throw new Error("The selected date is unavailable for these facilities and stay slot. Choose another date."); }

                let saved = null;

                for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {

                    const reservation = reservationAttempt;

                    const result =
                        await saveReservationHistory(
                            reservation
                        );

                    if (
                        result &&
                        result.success &&
                        result.reservation
                    ) {
                        saved = result.reservation;
                        break;
                    }

                    if (
                        result &&
                        result.error === "REFERENCE_COLLISION"
                    ) {
                        reservationAttempt.reference =
                            await generateUniqueReservationReference();
                        continue;
                    }

                    showReservationSaveError(
                        result && result.message
                    );
                    return;
                }

                if (!saved) {
                    showReservationSaveError(
                        "Reservation could not be saved. Please try again. Your form details have been kept."
                    );
                    return;
                }

                lastSavedReservation = saved;
                presentReservationConfirmation(saved);
                sendConfirmationEmailOnce(saved);

            } catch (err) {

                console.error("Reservation save failed:", err);
                showReservationSaveError(
                    err.message || "Shared reservation could not be saved. Please try again. Your form details have been kept."
                );

            } finally {

                reservationSubmitLock = false;
                confirmButton.disabled = false;

            }

        }
    );

}


/* =========================================================
   EMAILJS RESERVATION CONFIRMATION EMAIL
========================================================= */

const EMAILJS_CONFIG = {
    PUBLIC_KEY: "qiKerR2jT2TV2n4eO",
    SERVICE_ID: "service_cse4f86",
    TEMPLATE_ID: "template_97nryvr"
};

// Initialize EmailJS
if (typeof emailjs !== "undefined" && EMAILJS_CONFIG.PUBLIC_KEY) {
    try {
        emailjs.init({
            publicKey: EMAILJS_CONFIG.PUBLIC_KEY
        });
    } catch (err) {
        console.error("EmailJS init error in reservation.js:", err);
    }
}

function sendReservationConfirmationEmail(reservation) {
    if (!reservation || !reservation.email) return;

    if (typeof emailjs === "undefined" || !EMAILJS_CONFIG.SERVICE_ID || EMAILJS_CONFIG.SERVICE_ID === "YOUR_SERVICE_ID") {
        console.log("EmailJS not configured for reservation emails.");
        return;
    }

    const facilityNames = (reservation.facilities || []).map(f => f.name).join(", ") || "Seaside Resort Package";
    const totalPriceFormatted = reservation.prices ? `₱${(reservation.prices.total || 0).toLocaleString()}` : "₱0";

    const templateParams = {
        to_email: reservation.email,
        email: reservation.email,
        user_email: reservation.email,
        guest_name: reservation.guestName || "Valued Guest",
        email_subject: `Reservation Confirmation #${reservation.reference} - Catherine's Sanctuary`,
        email_title: `Reservation Confirmation #${reservation.reference}`,
        message_body: `Thank you for booking with Catherine's Bagasbas Lighthouse Resort! Your reservation #${reservation.reference} for ${reservation.checkinDate || "your stay"} has been recorded successfully.`,
        reservation_ref: reservation.reference,
        booking_ref: reservation.reference,
        checkin_date: reservation.checkinDate || "TBD",
        stay_duration: reservation.duration || "Standard Stay",
        total_guests: reservation.totalGuests || 1,
        facilities_summary: facilityNames,
        total_price: totalPriceFormatted,
        code: `Reservation Ref: ${reservation.reference}`,
        verification_code: `Reservation Ref: ${reservation.reference}`
    };

    emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        templateParams,
        { publicKey: EMAILJS_CONFIG.PUBLIC_KEY }
    ).then((res) => {
        console.log("Reservation confirmation email sent successfully:", res);
        const modalP = document.querySelector("#successModal p");
        if (modalP) {
            modalP.innerHTML = `Thank you, <strong>${escapeHtml(reservation.guestName)}</strong>! Your reservation (<strong>${reservation.reference}</strong>) has been recorded, and a confirmation email has been dispatched to <strong>${escapeHtml(reservation.email)}</strong>.`;
        }
    }).catch((err) => {
        console.error("Failed to send reservation confirmation email:", err);
    });
}


/* =========================================================
/* =========================================================
   RESERVATION HISTORY & MASTER SYNC
========================================================= */

async function saveReservationHistory(reservation) {
    // Never fall back to local history or upload its seed/demo bookings.
    if (!window.SharedReservations) throw new Error("Shared reservations are unavailable. Please retry.");
    return window.SharedReservations.createReservation(reservation);
}


/* =========================================================
   CLOSE SUCCESS MODAL
========================================================= */

const closeModal =
    document.getElementById(
        "closeModal"
    );


if (closeModal) {

    closeModal.addEventListener(
        "click",
        () => {

            document.body.style.overflow =
                "";


            window.location.href =
                reservationConfirmationDestination();

        }
    );

}


/* =========================================================
   CLOSE MODAL WHEN CLICKING BACKDROP
========================================================= */

if (
    successModal
) {

    successModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                successModal
            ) {

                if (isCloudReservationTest() && lastSavedReservation) { window.location.href = reservationConfirmationDestination(); return; }
                successModal.classList.remove(
                    "show"
                );


                document.body.style.overflow =
                    "";

            }

        }
    );

}


/* =========================================================
   ESC KEY CLOSES MODAL
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            successModal &&
            successModal.classList.contains(
                "show"
            )
        ) {

            if (isCloudReservationTest() && lastSavedReservation) { window.location.href = reservationConfirmationDestination(); return; }
            successModal.classList.remove(
                "show"
            );


            document.body.style.overflow =
                "";

        }

    }
);


/* =========================================================
   INITIALIZE PAGE
========================================================= */

let hasFreshHomepageChoices = false;
try { hasFreshHomepageChoices = Boolean(sessionStorage.getItem("pendingReservation")); } catch { /* Optional storage. */ }
loadPendingReservation();

updateGuestCounters();

updateFacilities();

updateSummary();

updateProgress(1);


// Tab-scoped form draft only; never an authentication or booking-save signal.
const bookingDraftKey = "reservationSignInDraft";
const bookingDraftFields = ["checkinDate", "stayDuration", "honorific", "fullName", "mobileNumber", "emailAddress", "specialRequests"];
function saveBookingDraft() {
    if (lastSavedReservation) return;
    try {
        const values = Object.fromEntries(bookingDraftFields.map(id => [id, document.getElementById(id)?.value || ""]));
        sessionStorage.setItem(bookingDraftKey, JSON.stringify({ savedAt: Date.now(), values,
            counts: { adults: reservationData.adults, children: reservationData.children, senior: reservationData.senior },
            facilities: [...document.querySelectorAll('input[name="facility"]:checked')].map(input => input.value),
            terms: Boolean(document.getElementById("agreeTerms")?.checked)
        }));
    } catch { /* Storage availability never grants access. */ }
}
function restoreBookingDraft() {
    if (hasFreshHomepageChoices) return;
    try {
        const draft = JSON.parse(sessionStorage.getItem(bookingDraftKey) || "null");
        if (!draft || Date.now() - draft.savedAt > 30 * 60 * 1000) return;
        for (const id of bookingDraftFields) {
            const input = document.getElementById(id);
            if (input && typeof draft.values?.[id] === "string" && (id !== "stayDuration" || window.BookingSlots?.[draft.values[id]])) input.value = draft.values[id];
        }
        for (const key of ["adults", "children", "senior"]) {
            if (Number.isInteger(draft.counts?.[key]) && draft.counts[key] >= 0 && draft.counts[key] <= 100) reservationData[key] = draft.counts[key];
        }
        if (Array.isArray(draft.facilities)) document.querySelectorAll('input[name="facility"]').forEach(input => { input.checked = draft.facilities.includes(input.value); input.closest(".facility-option")?.classList.toggle("selected", input.checked); });
        const terms = document.getElementById("agreeTerms");
        if (terms) terms.checked = draft.terms === true;
        updateGuestCounters(); updateFacilities(); updateSummary();
    } catch { /* Malformed drafts are ignored, not trusted. */ }
}
restoreBookingDraft();
const bookingConfirm = document.getElementById("confirmReservation");
if (bookingConfirm) bookingConfirm.disabled = true;
(async () => {
    try {
        // identity() waits for the named app's initial onAuthStateChanged event.
        await window.SharedReservations.identity();
        if (bookingConfirm) bookingConfirm.disabled = false;
        try { sessionStorage.removeItem(bookingDraftKey); } catch { /* Optional draft. */ }
    } catch {
        saveBookingDraft();
        window.location.replace("login.html?next=reservation.html");
    }
})();
window.addEventListener("pagehide", saveBookingDraft);
