"use strict";
// Master Reservations reads only the named shared-reservations service. No local
// booking actions, email SDK, device connector, or check-in writes belong here.
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const money = value => Number.isFinite(value) ? new Intl.NumberFormat("en-PH", {style:"currency",currency:"PHP"}).format(value) : "Not recorded";
    const container = $("reservationsSection"), badge = $("showingEntriesBadge"), dialog = $("reservationDetails");
    const busy = new Set(), drafts = new Map(), openPanels = new Set();
    let records = [], visible = [], feedback = "", selectedDetails = null, opener = null;
    let verifiedAdministrator = false, listVersion = 0, checkoutReference = null;
    const checkoutDialog = $("confirmCheckoutDialog");
    const cloud = window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true || (["localhost","127.0.0.1"].includes(location.hostname) && location.port === "5001");
    // check-in.js deliberately disables its scanner: no trusted live full-UID
    // source/transport is configured in this checkout. Do not invent readiness
    // from an admin role, card assignment, URL, or browser-local setting. Keep the
    // trusted backend verifier untouched; expose the desk only after its actual
    // live integration supplies a supported readiness contract in a later task.
    const liveCheckInConfigured = false;
    const statusKey = value => ({"Pending Verification":"pending","Confirmed":"confirmed","Checked In":"active","Checking Out":"checking-out","Checked Out":"checked-out","Completed":"completed","Cancelled":"cancelled"}[value] || "other");
    function dateLabel(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "Date unavailable";
        const date = new Date(value + "T00:00:00Z");
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date.toLocaleDateString("en-PH", {year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}) : "Date unavailable";
    }
    const slotLabel = record => typeof record.duration === "string" && record.duration.trim() && record.duration !== "4500" && !/^\d+$/.test(record.duration) ? record.duration : "Duration unavailable";
    const facilityName = facility => facility.value === "event" && facility.packageVersion === 2 ? "Celebration Event Package — Event Place, Swimming Pool & Stage Band" : facility.name || "Reserved facility";
    function localDate(offset = 0) { const day = new Date(); day.setDate(day.getDate()+offset); return [day.getFullYear(),String(day.getMonth()+1).padStart(2,"0"),String(day.getDate()).padStart(2,"0")].join("-"); }
    for (const button of document.querySelectorAll(".date-filter")) if (button.dataset.date !== "all") button.textContent = (button.dataset.date === "today" ? "Today" : "Tomorrow") + " (" + dateLabel(localDate(button.dataset.date === "today" ? 0 : 1)) + ")";
    function showFeedback(message) { feedback = message; badge.textContent = message; }
    function checkInState(record) {
        if (record.status !== "Confirmed") return "";
        if (!record.rfidLinked) return '<p class="checkin-message">Assign an RFID card first</p>';
        if (cloud) return '<p class="checkin-message">RFID check-in is unavailable in this test mode</p>';
        if (!liveCheckInConfigured) return '<p class="checkin-message">RFID check-in is unavailable: a trusted live scanner is not configured.</p>';
        // Navigation only. This branch must never write booking/device state.
        return '<a class="open-checkin-desk" href="check-in.html?reservation='+encodeURIComponent(record.reference)+'">Open Check-in Desk</a>';
    }
    function render() {
        for (const panel of container.querySelectorAll(".rfid-panel")) { if (panel.open) openPanels.add(panel.dataset.ref); else openPanels.delete(panel.dataset.ref); }
        container.querySelectorAll(".reservation-row").forEach(row=>row.remove());
        $("statTotalBookings").textContent = records.length;
        $("statPendingCount").textContent = records.filter(record=>record.status === "Pending Verification").length;
        $("statActiveGuests").textContent = records.filter(record=>record.status === "Checked In").reduce((sum,record)=>sum+(Number.isInteger(record.totalGuests)?record.totalGuests:0),0);
        for (const record of records) {
            const reference = esc(record.reference), key = statusKey(record.status), assigned = Boolean(record.rfidLinked);
            const completion = window.SHARED_RESERVATIONS_CONFIG?.mode === 'emulator' && !cloud && verifiedAdministrator && record.status === 'Checking Out' ? '<button type="button" class="confirm-checkout-btn" data-ref="'+reference+'">Confirm Checkout</button>' : '';
            const cardState = record.status === 'Completed' && record.checkoutConfirmation?.cardReleased ? 'Released' : (assigned ? 'Assigned' : 'Unassigned');
            const panel = record.status === "Confirmed" && !assigned ? `<details class="rfid-panel" data-ref="${reference}" ${openPanels.has(record.reference)?"open":""}><summary>Assign RFID</summary><form class="rfid-assignment-form" data-ref="${reference}" novalidate><label for="rfid-${reference}">Full card UID (hex)</label><input class="rfid-uid-input" id="rfid-${reference}" type="text" value="${esc(drafts.get(record.reference)||"")}" maxlength="64" required autocomplete="off" spellcheck="false" aria-describedby="rfid-help-${reference}"><small id="rfid-help-${reference}">4, 7 or 10 complete hex bytes. Preserve leading zeros.</small><button class="assign-rfid-btn" type="submit">Assign RFID</button></form></details>` : "";
            const row = document.createElement("article"); row.className = "reservation-row"; row.dataset.ref = record.reference; row.dataset.status = key;
            row.innerHTML = `<div class="booking-ref" data-label="Reference & Date"><strong>${reference}</strong><span>${esc(dateLabel(record.checkinDate))}</span></div><div class="guest-details" data-label="Guest"><strong>${esc(record.guestName || "Not recorded")}</strong></div><div class="assignment" data-label="Package / Facilities">${(record.facilities || []).map(facility=>'<span>'+esc(facilityName(facility))+'</span>').join("") || "Not recorded"}</div><div class="folio" data-label="Booking Total"><strong>${money(record.prices?.total)}</strong></div><div data-label="Status"><span class="checkin-state ${key}">${esc(record.status || "Not recorded")}</span>${record.status === "Checking Out" ? "<p>Awaiting trusted departure verification</p>" : ""}</div><div class="rfid-assignment" data-label="RFID Assignment"><span class="rfid-assignment-status">${cardState}</span>${panel}${checkInState(record)}</div><div class="row-actions" data-label="Actions">${completion}${record.status === "Pending Verification"?'<button type="button" class="approve-btn" data-ref="'+reference+'">Approve</button>':""}<button type="button" class="view-btn" data-ref="${reference}">View Details</button></div>`;
            container.appendChild(row);
        }
        bindBusy(); applyFilters();
        if (dialog.open) { const current=records.find(record=>record.reference===selectedDetails); if(current)renderDetails(current);else{dialog.close();showFeedback("This reservation is no longer available.");} }
    }
    function applyFilters() {
        const term = $("searchInput").value.trim().toLowerCase(), facility = document.querySelector(".filter-chip.active")?.dataset.facility || "all", status = $("statusFilter").value;
        const relative = document.querySelector(".date-filter.active")?.dataset.date || "all";
        const date = $("checkinDateFilter").value || (relative === "all" ? "" : localDate(relative === "today" ? 0 : 1));
        visible = records.filter(record => (!term || [record.reference,record.guestName].some(value=>String(value||"").toLowerCase().includes(term))) && (status === "all" || statusKey(record.status) === status) && (!date || record.checkinDate === date) && (facility === "all" || (record.facilities||[]).some(item=>item.value === facility || item.value === "buyout" || (facility === "pool" && item.value === "event" && item.packageVersion === 2))));
        const references = new Set(visible.map(record=>record.reference));
        container.querySelectorAll(".reservation-row").forEach(row=>{row.hidden=!references.has(row.dataset.ref);});
        $("emptyReservations").hidden = visible.length !== 0;
        badge.textContent = feedback || "Showing " + visible.length + " of " + records.length + " reservations";
    }
    function renderDetails(record) {
        const fields = [["Reference",record.reference],["Status",record.status],["Check-in Date",dateLabel(record.checkinDate)],["Stay Duration & Slot",slotLabel(record)],["Primary Guest",record.guestName],["Email",record.email],["Mobile",record.mobile],["Total Guests",record.totalGuests],["Guest Breakdown",["adults","children","senior"].every(key=>Number.isInteger(record[key]))?`${record.adults} adults · ${record.children} children · ${record.senior} senior/PWD`:"Not recorded"],["RFID Assignment",record.status === "Completed" && record.checkoutConfirmation?.cardReleased ? "Released" : (record.rfidLinked?"Assigned":"Unassigned")]];
        if (record.checkoutConfirmation) fields.push(['Departure', 'Admin-confirmed (demo)'], ['Confirmed by', record.checkoutConfirmation.confirmedBy], ['Confirmed at', new Date(record.checkoutConfirmation.confirmedAt).toLocaleString('en-PH')], ['Active card released', record.checkoutConfirmation.cardReleased ? 'Yes' : 'No; binding did not point to this booking']);
        const prices = [["Subtotal",record.prices?.subtotal],["Daet Tourism & Marine Tax",record.prices?.tourismTax],["Resort Service Charge (8%)",record.prices?.serviceCharge],["Booking Total",record.prices?.total]].filter(([,value])=>Number.isFinite(value));
        $("reservationDetailsTitle").textContent = "Reservation Details — " + record.reference;
        $("reservationDetailsBody").innerHTML = '<dl class="detail-grid">'+fields.filter(([,value])=>value!==undefined&&value!==null&&value!=="").map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join("")+'</dl><h3>Package / Facilities</h3><ul class="detail-facilities">'+(record.facilities||[]).map(facility=>'<li>'+esc(facilityName(facility))+' — '+money(facility.price)+'</li>').join("")+'</ul>'+(record.specialRequests?.trim()?'<h3>Special Requests</h3><p class="special-requests">'+esc(record.specialRequests)+'</p>':"")+'<dl class="saved-prices">'+prices.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+money(value)+'</dd></div>').join("")+'</dl>';
    }
    function bindBusy() {
        container.querySelectorAll(".approve-btn").forEach(button=>{button.disabled=busy.has("approve:"+button.dataset.ref);button.setAttribute("aria-busy",String(button.disabled));});
        container.querySelectorAll(".rfid-assignment-form").forEach(form=>{const saving=busy.has("rfid:"+form.dataset.ref);form.setAttribute("aria-busy",String(saving));form.querySelectorAll("input,button").forEach(control=>{control.disabled=saving;});});
    }
    async function save(kind, reference, input) {
        const key=kind+":"+reference;if(busy.has(key))return;
        busy.add(key);bindBusy();showFeedback((kind==="approve"?"Confirming approval":"Saving RFID assignment")+" for #"+reference+"…");
        try {
            const result=kind==="approve"?await window.SharedReservations.approveReservation(reference):await window.SharedReservations.assignRfid(reference,input);
            if(!result?.success || (kind==="approve"?result.status!=="Confirmed":!result.assigned))throw Error("The save was not confirmed. Please retry.");
            if(kind==="rfid")drafts.delete(reference);
            showFeedback(kind==="approve"?(result.alreadyConfirmed?"#"+reference+" is already confirmed. No additional transition was applied.":"#"+reference+" confirmed. RFID remains unassigned; facility access is locked."):(result.alreadyAssigned?"This reservation already has this card. #"+reference:"RFID card assigned to #"+reference+". Booking remains Confirmed; facility access is locked."));
        } catch(error) { showFeedback(error.message || "Save failed. Please retry."); }
        finally { busy.delete(key);bindBusy(); }
    }
    container.addEventListener("click",event=>{
        const checkout=event.target.closest('.confirm-checkout-btn');
        if(checkout){
            const record=records.find(item=>item.reference===checkout.dataset.ref);
            if(!verifiedAdministrator || record?.status!=='Checking Out')return;
            checkoutReference=record.reference;
            $('checkoutBookingReference').textContent=record.reference;
            $('confirmGuestDeparted').checked=false;
            $('confirmCardReady').checked=false;
            $('checkoutConfirmationFeedback').textContent='';
            checkoutDialog.showModal();
            return;
        }
        const approve=event.target.closest(".approve-btn");if(approve){save("approve",approve.dataset.ref);return;}
        const view=event.target.closest(".view-btn");if(view){const record=records.find(item=>item.reference===view.dataset.ref);if(!record){showFeedback("This reservation is unavailable.");return;}opener=view;selectedDetails=record.reference;renderDetails(record);dialog.showModal();}
    });
    container.addEventListener("input",event=>{const form=event.target.closest(".rfid-assignment-form");if(form)drafts.set(form.dataset.ref,event.target.value);});
    container.addEventListener("submit",event=>{const form=event.target.closest(".rfid-assignment-form");if(!form)return;event.preventDefault();const input=form.querySelector("input").value;drafts.set(form.dataset.ref,input);save("rfid",form.dataset.ref,input);});
    $('cancelCheckout').addEventListener('click',()=>checkoutDialog.close());
    $('confirmCheckoutForm').addEventListener('submit',async event=>{
        event.preventDefault();
        const reference=checkoutReference;
        if(!reference || busy.has('checkout:'+reference))return;
        busy.add('checkout:'+reference);
        $('saveCheckoutConfirmation').disabled=true;
        $('checkoutConfirmationFeedback').textContent='Saving admin-confirmed departure...';
        try {
            await window.SharedReservations.confirmCheckout(reference,{guestDeparted:$('confirmGuestDeparted').checked,cardReadyForReuse:$('confirmCardReady').checked});
            checkoutDialog.close();
            showFeedback('#'+reference+' Completed. Departure admin-confirmed (demo).');
        } catch(error){$('checkoutConfirmationFeedback').textContent=error.message || 'Checkout was not confirmed. Retry.';}
        finally{busy.delete('checkout:'+reference);$('saveCheckoutConfirmation').disabled=false;}
    });
    checkoutDialog.addEventListener('close',()=>container.querySelector('.confirm-checkout-btn[data-ref="'+checkoutReference+'"]')?.focus());
    $("closeReservationDetails").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>{if(opener?.isConnected)opener.focus();else container.querySelector('.view-btn[data-ref="'+selectedDetails+'"]')?.focus();selectedDetails=null;});
    $("searchInput").addEventListener("input",()=>{feedback="";applyFilters();});$("statusFilter").addEventListener("change",()=>{feedback="";applyFilters();});
    document.querySelectorAll(".filter-chip").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".filter-chip").forEach(item=>item.classList.toggle("active",item===button));feedback="";applyFilters();}));
    document.querySelectorAll(".date-filter").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".date-filter").forEach(item=>item.classList.toggle("active",item===button));$("checkinDateFilter").value="";feedback="";applyFilters();}));
    $("checkinDateFilter").addEventListener("change",()=>{document.querySelectorAll(".date-filter").forEach(button=>button.classList.remove("active"));feedback="";applyFilters();});
    $("reviewPendingLink").addEventListener("click",()=>{$("statusFilter").value="pending";feedback="";applyFilters();});
    $("exportButton").addEventListener("click",()=>{
        const cell=value=>'"'+String(value??"").replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
        const rows=[["Reference","Check-in Date","Guest","Package / Facilities","Booking Total (PHP)","Status","RFID Assignment"],...visible.map(record=>[record.reference,record.checkinDate,record.guestName,(record.facilities||[]).map(facilityName).join("; "),Number.isFinite(record.prices?.total)?record.prices.total:"",record.status,record.rfidLinked?"Assigned":"Unassigned"])];
        const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="catherines-reservations-"+localDate()+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $("logoutButton").addEventListener("click",async()=>{try{await window.SharedReservations.signOut();location.href="login.html";}catch{showFeedback("Could not sign out. Please retry.");}});
    // Hardware pages stay on their dedicated routes in supported environments.
    try {
        const stop=window.SharedReservations.subscribeReservations(true,async value=>{const version=++listVersion;try{await window.SharedReservations.identity(true);if(version!==listVersion)return;verifiedAdministrator=true;records=value;}catch{verifiedAdministrator=false;records=[];}render();},()=>{++listVersion;verifiedAdministrator=false;records=[];render();if(checkoutDialog.open)checkoutDialog.close();if(dialog.open)dialog.close();showFeedback("Shared list unavailable. Sign in with an administrator account and retry.");});
        window.addEventListener("pagehide",()=>{stop();if(dialog.open)dialog.close();},{once:true});
    } catch { showFeedback("Shared reservations are unavailable. Please retry."); }
});
