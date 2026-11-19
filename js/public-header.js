"use strict";
(function () {
    const header = document.querySelector('[data-public-header]');
    if (!header) return;
    const cloud = window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true;
    header.className = 'public-header';
    if (document.body.matches('.my-reservation-page, .guest-dashboard-page, .guest-facility-page')) header.classList.add('is-scroll-dark');
    header.innerHTML = `
      <div class="public-header-inner">
        <a class="public-brand" href="index.html" aria-label="Catherine’s homepage"><img src="assets/Catherine's Logo.png" alt=""><span><strong>Catherine’s</strong><small>BAGASBAS LIGHTHOUSE RESORT</small></span></a>
        <button type="button" class="public-toggle" id="menuToggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="mainNav">☰</button>
        <nav class="public-nav" id="mainNav" aria-label="Main navigation">
          <a href="index.html#home">Home</a><a href="index.html#about">About</a><a href="index.html#facilities">Facilities</a><a href="index.html#contact">Contact</a>
        </nav>
        <div class="public-actions">
          <a id="myReservationLink" class="public-reservation" href="my-reservation.html">My Reservation</a>
          <a class="public-book" id="bookButton" data-book href="reservation.html">Book Now</a>
          <div class="public-account">
            <button type="button" id="profileLink" aria-label="My account" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="currentColor"/></svg></button>
            <div id="accountMenu" class="public-account-menu" role="menu" aria-label="My account" hidden>
              <a role="menuitem" href="my-reservation.html">My Reservation</a>
              <button type="button" role="menuitem" id="publicSignOut">Sign Out</button>
            </div>
          </div>
        </div>
      </div><p id="accountFeedback" class="public-feedback" aria-live="polite" hidden></p>`;
    const $ = id => document.getElementById(id);
    let version = 0, account = null;
    let scheduleSectionUpdate = () => {};
    const measure = () => { document.documentElement.style.setProperty('--public-nav-height', header.getBoundingClientRect().height + 'px'); scheduleSectionUpdate(); };
    new ResizeObserver(measure).observe(header); measure();
    document.fonts.ready.then(measure);
    const closeAccount = (focus = false) => { $('accountMenu').hidden = true; $('profileLink').setAttribute('aria-expanded', 'false'); if (focus) $('profileLink').focus(); };
    const closeNav = () => { $('mainNav').classList.remove('open'); $('menuToggle').setAttribute('aria-expanded', 'false'); measure(); };
    $('menuToggle').addEventListener('click', () => { closeAccount(); const open = $('mainNav').classList.toggle('open'); $('menuToggle').setAttribute('aria-expanded', String(open)); });
    $('mainNav').addEventListener('click', event => { if (event.target.closest('a')) closeNav(); });
    $('profileLink').addEventListener('click', async () => {
        try { account = await window.SharedReservations.identity(); }
        catch { window.location.href = 'login.html?next=my-reservation.html'; return; }
        if (account.admin) { window.location.href = 'admin-dashboard.html'; return; }
        closeNav();
        const open = $('accountMenu').hidden;
        $('accountMenu').hidden = !open; $('profileLink').setAttribute('aria-expanded', String(open));
        if (open) $('accountMenu').querySelector('[role="menuitem"]').focus();
    });
    $('accountMenu').addEventListener('keydown', event => {
        const items = [...$('accountMenu').querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); closeAccount(true); }
        else if (event.key === 'Tab') closeAccount();
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next].focus();
        }
    });
    document.addEventListener('click', event => { if (!event.target.closest('.public-account')) closeAccount(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!$('accountMenu').hidden) closeAccount(true); closeNav(); } });
    $('publicSignOut').addEventListener('click', async () => {
        try {
            await window.SharedReservations.signOut();
            try { for (const key of ['isLoggedIn', 'userRole', 'guestName', 'guestEmail', 'guestPhone', 'guestMobile']) localStorage.removeItem(key); } catch { /* Hints only. */ }
            window.location.href = 'index.html';
        } catch { $('accountFeedback').hidden = false; $('accountFeedback').textContent = 'Could not sign out. Please retry.'; }
    });
    try {
        const off = window.SharedReservations.watchIdentity(async () => {
            const current = ++version; closeAccount();
            try { const value = await window.SharedReservations.identity(); if (current === version) account = value; }
            catch { if (current === version) account = null; }
        });
        window.addEventListener('pagehide', off, { once: true });
    } catch { /* Public links still lead to their authenticated page guards. */ }
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    if (currentPage === 'reservation.html') {
        // A zero-height marker retains the header's natural position while it sticks.
        const marker = document.createElement('div');
        marker.setAttribute('aria-hidden', 'true');
        header.before(marker);
        let frame = 0;
        const updateStickyColor = () => {
            frame = 0;
            header.classList.toggle('is-scroll-dark', marker.getBoundingClientRect().top < 0);
        };
        const scheduleStickyColor = () => {
            if (!frame) frame = requestAnimationFrame(updateStickyColor);
        };
        window.addEventListener('scroll', scheduleStickyColor, { passive: true });
        window.addEventListener('pageshow', scheduleStickyColor);
        window.addEventListener('resize', scheduleStickyColor);
        updateStickyColor();
    }
    for (const link of header.querySelectorAll('a')) {
        const url = new URL(link.href);
        if (url.pathname.endsWith('/' + currentPage) && !url.hash && currentPage !== 'index.html') link.setAttribute('aria-current', 'page');
    }
    if (currentPage === 'index.html') {
        // Follow actual target positions, keeping section state and colors in sync.
        header.dataset.homeSection = 'home';
        const sectionLinks = [...$('mainNav').querySelectorAll('a')];
        let frame = 0, initialAnchorPending = true;
        const updateSection = () => {
            frame = 0;
            const sections = sectionLinks.map(link => ({link, target:document.getElementById(new URL(link.href).hash.slice(1))}))
                .filter(item => item.target).map(item => ({...item, top:item.target.getBoundingClientRect().top}))
                .sort((a,b) => a.top - b.top);
            const line = Math.max(header.getBoundingClientRect().height, parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 1;
            let active = sections[0];
            for (const section of sections) if (section.top <= line) active = section;
            // A compact footer cannot reach the header's activation line at page end.
            const contact = sections.find(item => item.target.id === 'contact');
            if (contact && contact.top < innerHeight && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) active = contact;
            header.dataset.homeSection = active?.target.id || 'home';
            for (const link of sectionLinks) {
                if (link === active?.link) link.setAttribute('aria-current','location');
                else link.removeAttribute('aria-current');
            }
        };
        scheduleSectionUpdate = () => { if (!frame) frame = requestAnimationFrame(updateSection); };
        window.addEventListener('scroll',scheduleSectionUpdate,{passive:true});
        for (const event of ['resize','pageshow','load']) window.addEventListener(event,scheduleSectionUpdate);
        let anchorFrame = 0;
        const restoreAnchor = () => {
            if (anchorFrame) cancelAnimationFrame(anchorFrame);
            anchorFrame = requestAnimationFrame(() => {
                anchorFrame = 0;
                const target = sectionsTarget(location.hash);
                if (target) target.scrollIntoView({block:'start',behavior:'instant'});
                scheduleSectionUpdate();
            });
        };
        // Native history can restore an intermediate smooth-scroll position.
        // Re-align explicit hash navigation; ordinary scrolling never changes history.
        window.addEventListener('hashchange',restoreAnchor);
        window.addEventListener('popstate',restoreAnchor);
        for (const event of ['wheel','touchstart','pointerdown','keydown']) window.addEventListener(event,()=>{initialAnchorPending=false;},{once:true,passive:true});
        // Re-align direct anchors once fonts/header sizing settles, without fighting user input.
        document.fonts.ready.then(()=>{
            const target = sectionsTarget(location.hash);
            if (initialAnchorPending && target) target.scrollIntoView({block:'start',behavior:'instant'});
            scheduleSectionUpdate();
        });
        function sectionsTarget(hash) { return sectionLinks.some(link=>new URL(link.href).hash===hash) ? document.getElementById(hash.slice(1)) : null; }
        new ResizeObserver(scheduleSectionUpdate).observe(document.body);
        scheduleSectionUpdate();
    }
    function scan() {
        scheduleSectionUpdate(); // Also observes the asynchronously loaded Contact footer.
        for (const link of document.querySelectorAll('a')) {
            if (/Track Existing Booking/i.test(link.textContent)) { link.textContent = 'View My Reservation'; link.href = 'my-reservation.html'; }
            if (link.id === 'footerDashboard' && link.textContent.trim() !== 'My Reservation') { link.textContent = 'My Reservation'; link.href = 'my-reservation.html'; }
            if (cloud && (/Diorama Preview/i.test(link.textContent) || ['/demo.html','/guest-dashboard.html','/check-in.html','/cottage.html','/pool.html','/ktv.html','/event.html'].includes(new URL(link.getAttribute('href') || '', location.href).pathname))) link.hidden = true;
        }
        for (const img of document.querySelectorAll('main img, .gallery-grid img')) {
            if (img.dataset.fallbackReady) continue; img.dataset.fallbackReady = 'true';
            const fallback = () => {
                if (!img.isConnected) return;
                const box = document.createElement('div'); box.className = 'public-image-fallback ' + img.className;
                box.setAttribute('role', 'img'); box.setAttribute('aria-label', img.alt + ' — photo unavailable');
                box.textContent = img.alt + ' — photo unavailable';
                if (img.dataset.category) box.dataset.category = img.dataset.category;
                img.replaceWith(box);
            };
            img.addEventListener('error', fallback, { once: true });
            if (img.complete && !img.naturalWidth) fallback();
        }
    }
    scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
