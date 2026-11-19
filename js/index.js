'use strict';


/* =========================================================
   LOGIN STATE
========================================================= */

const destination = () => 'reservation.html';

/* =========================================================
   RESERVATION DATE
========================================================= */

const dateInput =
  document.getElementById(
    'stayDate'
  );


const today =
  new Date();


const localToday =
  new Date(
    today.getTime() -
    today.getTimezoneOffset() *
    60000
  )
  .toISOString()
  .slice(
    0,
    10
  );


dateInput.min =
  localToday;


dateInput.value =
  localToday;


/* =========================================================
   AVAILABILITY FORM
========================================================= */

document
  .getElementById(
    'availabilityForm'
  )
  .addEventListener(
    'submit',
    event => {

      event.preventDefault();


      if (!dateInput.value) {

        return dateInput.reportValidity();

      }


      sessionStorage.setItem(
        'pendingReservation',

        JSON.stringify({

          date:
            dateInput.value,

          duration:
            document.getElementById(
              'duration'
            ).value,

          guests:
            document.getElementById(
              'guests'
            ).value,

          quarters:
            document.getElementById(
              'quarters'
            ).value

        })

      );


      window.location.href =
        destination();

    }
  );


/* =========================================================
   GALLERY FILTER
========================================================= */

const filters =
  document.querySelectorAll(
    '[data-filter]'
  );





filters.forEach(
  button => {

    button.addEventListener(
      'click',
      () => {

        filters.forEach(
          item =>
            item.classList.remove(
              'selected'
            )
        );


        button.classList.add(
          'selected'
        );


        document.querySelectorAll('[data-category]').forEach(
          img => {

            img.hidden =
              button.dataset.filter !== 'all' &&
              img.dataset.category !==
                button.dataset.filter;

          }
        );

      }
    );

  }
);

/* =========================================================
   CURRENT YEAR
========================================================= */

const footerYear = document.getElementById('year');
if (footerYear) footerYear.textContent = new Date().getFullYear();

"use strict";
// Progressive enhancement: content is visible in CSS/HTML, even without this script.
(function () {
    const section = document.getElementById('about');
    if (!section || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const running = new Set();
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target); // Once per page load, including cancelled animations.
            if (motion.matches || entry.target.contains(document.activeElement)) continue;
            const copy = entry.target.dataset.aboutReveal === 'copy';
            try {
                const animation = entry.target.animate(copy
                    ? [{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}]
                    : [{opacity:0},{opacity:1}],
                    {duration:copy ? 320 : 300,delay:copy ? 0 : 120,easing:'ease-out',fill:'backwards'});
                running.add(animation);
                animation.finished.catch(()=>{}).finally(()=>running.delete(animation));
            } catch { /* No hidden class or inline style can strand the content. */ }
        }
    }, {threshold:0.12});
    section.querySelectorAll('[data-about-reveal]').forEach(element=>observer.observe(element));
    motion.addEventListener('change',event=>{
        if (!event.matches) return;
        observer.disconnect();
        running.forEach(animation=>animation.cancel());
        running.clear();
    });
})();
