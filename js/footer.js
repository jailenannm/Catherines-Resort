document.addEventListener("DOMContentLoaded", () => {

  const footerContainer =
    document.getElementById("footer-container");

  if (!footerContainer) {
    return;
  }

  fetch("components/footer.html")
    .then(response => {

      if (!response.ok) {
        throw new Error(
          `Failed to load footer: ${response.status}`
        );
      }

      return response.text();

    })

    .then(html => {

      footerContainer.innerHTML = html;
      footerContainer.querySelector('[data-footer-year]').textContent = new Date().getFullYear();
      // The Contact anchor is part of this async component, including direct visits.
      if (location.hash === '#contact') requestAnimationFrame(() => footerContainer.querySelector('#contact').scrollIntoView());

    })

    .catch(error => {

      console.error(
        "Footer loading error:",
        error
      );

    });

});
