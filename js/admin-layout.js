"use strict";
// Shared presentation only. Each page retains its trusted Firebase admin guard.
(function () {
    const sidebar = document.querySelector('[data-admin-sidebar]');
    if (!sidebar) return;
    const icons = {
        operations: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
        reservations: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
        overrides: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
        sensors: '<path d="M5 4a15 15 0 0 0 15 15L5 4Zm7 8 7-7M15 4h5v5M9 18l-3 3h12"/>',
        demo: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
        visitor: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>'
    };
    const icon = name => '<svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
    const links = [
        ['operations', 'admin-dashboard.html', 'Operational Center'],
        ['reservations', 'admin-reservations.html', 'Master Reservations'],
        ['overrides', 'diorama-control.html', 'IoT Control Center'],
        ['sensors', 'admin-dashboard.html#sensors', 'Sensors'],
        ['demo', 'demo.html', 'Demo Walkthrough']
    ];
    sidebar.innerHTML = '<a href="index.html" class="admin-brand"><img src="assets/Catherine\'s Logo.png" alt="Catherine\'s Logo" class="admin-logo"><div class="admin-brand-text"><strong>Catherine’s</strong><span>LIGHTHOUSE COMMAND</span></div></a><div class="admin-nav-label">NAVIGATION DECK</div><nav class="admin-nav" aria-label="Administration">'+links.map(([key, href, label]) => '<a class="admin-nav-item" data-admin-destination="'+key+'" href="'+href+'">'+icon(key)+'<span>'+label+'</span></a>').join('')+'</nav><div class="admin-sidebar-footer"><div class="admin-footer-actions"><a href="index.html" class="visitor-site">'+icon('visitor')+'<span>VISITOR SITE</span></a><button type="button" class="logout-button" id="logoutButton" aria-label="Sign Out">Sign Out</button></div></div>';

    const onOperations = location.pathname.endsWith('/admin-dashboard.html');
    function selected() {
        if (onOperations) return location.hash === '#sensors' ? 'sensors' : 'operations';
        if (/\/(diorama-control|manual-override)\.html$/.test(location.pathname)) return 'overrides';
        return location.pathname.endsWith('/demo.html') ? 'demo' : 'reservations';
    }
    function update() {
        const cloud = window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true || (['127.0.0.1','localhost'].includes(location.hostname) && location.port === '5001');
        sidebar.querySelectorAll('[data-admin-destination]').forEach(link => {
            link.hidden = cloud && link.dataset.adminDestination !== 'reservations';
            const active = link.dataset.adminDestination === selected();
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    }
    function contentReady() {
        update();
        const section = onOperations && location.hash === '#sensors' && document.getElementById('sensors');
        if (!section || section.closest('[hidden]')) return;
        requestAnimationFrame(() => {
            section.tabIndex = -1;
            section.focus({preventScroll:true});
            section.scrollIntoView({block:'start'});
        });
    }
    sidebar.addEventListener('click', event => {
        const link = event.target.closest('a[data-admin-destination="sensors"]');
        if (link && onOperations && location.hash === '#sensors' && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
            event.preventDefault();
            contentReady(); // Also handles clicking the already-selected hash after scrolling away.
        }
    });
    window.addEventListener('hashchange', contentReady);
    window.addEventListener('pageshow', contentReady);
    document.addEventListener('DOMContentLoaded', update);
    window.AdminLayout = {contentReady};
    update();
})();
