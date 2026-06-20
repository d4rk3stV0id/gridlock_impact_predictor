
        let activeWeatherPayload = "clear";
        let autoWeatherInterval = null;

        function showToast(message, type = "error") {
            const container = document.getElementById("toastContainer");
            const toast = document.createElement("div");
            const bgColor = type === "error" ? "bg-red-950 border-red-800" : "bg-slate-900 border-slate-700";
            const textColor = type === "error" ? "text-red-200" : "text-slate-200";
            toast.className = `flex items-center gap-3 border px-4 py-3 shadow-2xl transition-all duration-300 transform translate-x-[120%] pointer-events-auto ${bgColor} ${textColor}`;
            toast.innerHTML = `
                <span class="text-xs font-semibold">${message}</span>
                <button onclick="this.parentElement.style.transform='translateX(120%)'; setTimeout(() => this.parentElement.remove(), 300)" class="text-slate-500 hover:text-slate-300">&times;</button>
            `;
            container.appendChild(toast);
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    toast.style.transform = "translateX(0)";
                });
            });

            setTimeout(() => {
                if (toast.parentElement) {
                    toast.style.transform = "translateX(120%)";
                    setTimeout(() => {
                        if (toast.parentElement) toast.remove();
                    }, 300);
                }
            }, 5000);
        }

        async function fetchRealTimeWeather() {
            const weatherSelect = document.getElementById("weatherContext").value;
            const display = document.getElementById("autoWeatherDisplay");
            
            if (weatherSelect !== "auto") {
                if (autoWeatherInterval) clearInterval(autoWeatherInterval);
                display.textContent = "";
                activeWeatherPayload = weatherSelect;
                return;
            }

            try {
                const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current_weather=true");
                const data = await res.json();
                const code = data.current_weather.weathercode;
                
                if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
                    display.textContent = "(Heavy Rain)";
                    display.className = "ml-2 text-[10px] text-red-400 font-bold";
                    activeWeatherPayload = "heavy_rain";
                } else {
                    display.textContent = "(Clear)";
                    display.className = "ml-2 text-[10px] text-emerald-400 font-bold";
                    activeWeatherPayload = "clear";
                }
            } catch (err) {
                console.error("Weather API error", err);
                display.textContent = "(Default Clear)";
                display.className = "ml-2 text-[10px] text-slate-400";
                activeWeatherPayload = "clear";
            }
        }

        fetchRealTimeWeather();
        document.getElementById("weatherContext").addEventListener("change", fetchRealTimeWeather);
        autoWeatherInterval = setInterval(() => {
            if (document.getElementById("weatherContext").value === "auto") {
                fetchRealTimeWeather();
            }
        }, 12000);

        const operationLedger = new Map();
        let operationLedgerData = [];
        let orderCounter = 0;

        const kanbanState = new Map();
        const kanbanItemData = new Map();

        function saveState() {
            const state = {
                kanbanState: Array.from(kanbanState.entries()),
                kanbanItemData: Array.from(kanbanItemData.entries()),
                operationLedger: Array.from(operationLedger.entries()),
                operationLedgerData: operationLedgerData.map(item => {
                    const { trElement, ...rest } = item;
                    return rest;
                }),
                orderCounter: orderCounter
            };
            localStorage.setItem("meridian_sim_state", JSON.stringify(state));
        }

        function loadState() {
            const stateJson = localStorage.getItem("meridian_sim_state");
            if (stateJson) {
                try {
                    const state = JSON.parse(stateJson);
                    kanbanState.clear();
                    state.kanbanState.forEach(([k, v]) => kanbanState.set(k, v));
                    
                    kanbanItemData.clear();
                    state.kanbanItemData.forEach(([k, v]) => kanbanItemData.set(k, v));
                    
                    operationLedger.clear();
                    state.operationLedger.forEach(([k, v]) => operationLedger.set(k, v));
                    
                    operationLedgerData.length = 0;
                    state.operationLedgerData.forEach(item => {
                        item.trElement = createTrElement(item, null);
                        operationLedgerData.push(item);
                    });
                    
                    orderCounter = state.orderCounter || 0;
                    
                    renderKanban();
                    renderLedger();
                    if (document.getElementById("toggleGlobalView").checked) renderGlobalView();
                    renderActionPoints();
                } catch (e) {
                    console.error("Failed to load simulation state", e);
                }
            }
        }

        document.getElementById("restartSimBtn").addEventListener("click", () => {
            document.getElementById("restartConfirmModal").classList.remove("hidden");
            document.getElementById("restartConfirmModal").classList.add("flex");
        });
        document.getElementById("restartCancel").addEventListener("click", () => {
            document.getElementById("restartConfirmModal").classList.add("hidden");
            document.getElementById("restartConfirmModal").classList.remove("flex");
        });
        document.getElementById("restartConfirm").addEventListener("click", () => {
            localStorage.removeItem("meridian_sim_state");
            window.location.reload();
        });

        const NON_VEHICULAR_CAUSES = ["tree_fall", "water_logging", "pot_holes", "construction", "road_conditions", "public_event", "congestion"];
        let couplingLock = false;

        document.getElementById("eventCause").addEventListener("change", () => {
            if (couplingLock) return;
            couplingLock = true;
            const cause = document.getElementById("eventCause").value;
            if (NON_VEHICULAR_CAUSES.includes(cause)) {
                document.getElementById("vehicleType").value = "none";
            }
            couplingLock = false;
        });

        document.getElementById("vehicleType").addEventListener("change", () => {
            if (couplingLock) return;
            couplingLock = true;
            const veh = document.getElementById("vehicleType").value;
            if (veh !== "none") {
                const currentCause = document.getElementById("eventCause").value;
                if (NON_VEHICULAR_CAUSES.includes(currentCause)) {
                    document.getElementById("eventCause").value = "vehicle_breakdown";
                }
            }
            couplingLock = false;
        });

        const CORRIDOR_ZONES = [
            { name: "Tumkur Road", lat: 13.04, lng: 77.50, r: 0.04 },
            { name: "Bellary Road 1", lat: 13.01, lng: 77.58, r: 0.02 },
            { name: "Bellary Road 2", lat: 13.04, lng: 77.59, r: 0.02 },
            { name: "ORR North 1", lat: 13.04, lng: 77.55, r: 0.03 },
            { name: "ORR North 2", lat: 13.06, lng: 77.58, r: 0.03 },
            { name: "ORR East 1", lat: 12.96, lng: 77.68, r: 0.03 },
            { name: "ORR East 2", lat: 12.93, lng: 77.68, r: 0.03 },
            { name: "ORR West 1", lat: 12.96, lng: 77.52, r: 0.03 },
            { name: "Hosur Road", lat: 12.91, lng: 77.63, r: 0.03 },
            { name: "Bannerghata Road", lat: 12.89, lng: 77.59, r: 0.03 },
            { name: "Old Madras Road", lat: 12.99, lng: 77.65, r: 0.03 },
            { name: "Mysore Road", lat: 12.95, lng: 77.53, r: 0.03 },
            { name: "Magadi Road", lat: 12.98, lng: 77.50, r: 0.03 },
            { name: "IRR(Thanisandra road)", lat: 13.06, lng: 77.63, r: 0.03 },
            { name: "West of Chord Road", lat: 12.99, lng: 77.55, r: 0.02 },
            { name: "CBD 2", lat: 12.97, lng: 77.59, r: 0.015 },
        ];

        function detectCorridor(lat, lng) {
            let best = null;
            let bestDist = Infinity;
            for (const z of CORRIDOR_ZONES) {
                const d = Math.sqrt(Math.pow(lat - z.lat, 2) + Math.pow(lng - z.lng, 2));
                if (d < z.r && d < bestDist) {
                    bestDist = d;
                    best = z.name;
                }
            }
            return best || "Non-corridor";
        }

        function updateCorridorFromCoords() {
            const lat = parseFloat(document.getElementById("latitude").value);
            const lng = parseFloat(document.getElementById("longitude").value);
            if (!isNaN(lat) && !isNaN(lng)) {
                document.getElementById("corridor").value = detectCorridor(lat, lng);
            }
        }

        document.getElementById("latitude").addEventListener("change", updateCorridorFromCoords);
        document.getElementById("longitude").addEventListener("change", updateCorridorFromCoords);

        const map = L.map("map").setView([12.9716, 77.5946], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);

        const liveMarkers = L.markerClusterGroup().addTo(map);
        let customMarker = null;
        let feedRequestActive = false;

        document.getElementById("resetMapBtn").addEventListener("click", () => {
            map.setView([12.9716, 77.5946], 11);
        });

        document.getElementById("filterRisk").addEventListener("change", renderLedger);

        let currentSortKey = "orderIndex";
        let currentSortDir = "desc";

        document.querySelectorAll(".ledger-header").forEach(btn => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.sort;
                if (currentSortKey === key) {
                    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
                } else {
                    currentSortKey = key;
                    currentSortDir = "desc";
                }
                renderLedger();
            });
        });

        function updateSortIndicators() {
            document.querySelectorAll(".ledger-header").forEach(btn => {
                const arrow = btn.querySelector(".sort-arrow");
                if (btn.dataset.sort === currentSortKey) {
                    arrow.textContent = currentSortDir === "asc" ? " \u25B2" : " \u25BC";
                    arrow.style.color = "#10b981";
                } else {
                    arrow.textContent = "";
                }
            });
        }

        document.getElementById("resetControlsBtn").addEventListener("click", () => {
            document.getElementById("filterRisk").value = "All";
            currentSortKey = "orderIndex";
            currentSortDir = "desc";
            renderLedger();
        });

        window.clearCustomMarker = function() {
            if (customMarker) {
                map.removeLayer(customMarker);
                customMarker = null;
            }
            document.getElementById("latitude").value = "12.9716";
            document.getElementById("longitude").value = "77.5946";
        };

        const globalMarkerGroup = L.layerGroup();
        const actionPointsLayer = L.layerGroup().addTo(map);
        let heatLayer = null;

        document.getElementById("toggleGlobalView").addEventListener("change", (e) => {
            if (e.target.checked) {
                renderGlobalView();
                globalMarkerGroup.addTo(map);
            } else {
                map.removeLayer(globalMarkerGroup);
            }
        });

        function renderGlobalView() {
            globalMarkerGroup.clearLayers();
            operationLedgerData.forEach(ev => {
                const isHotspotStr = ev.is_hotspot ? 'true' : 'false';
                const safeType = ev.type ? ev.type.replace(/'/g, "\\'") : 'Unknown';
                const safeCorridor = ev.corridor ? ev.corridor.replace(/'/g, "\\'") : 'Unknown';
                const safeDuration = ev.formattedDuration ? ev.formattedDuration.replace(/'/g, "\\'") : '--';
                
                const safeAddress = ev.address ? ev.address.replace(/'/g, "\\'") : '';
                const dispatchEtaStr = ev.dispatchEta ? ev.dispatchEta : 'null';
                const dispatchDistStr = ev.dispatchDistance ? ev.dispatchDistance : 'null';
                const safeCause = ev.cause ? ev.cause.replace(/'/g, "\\'") : 'Unknown';
                const safeSeverity = ev.severity ? ev.severity.replace(/'/g, "\\'") : 'Unknown';
                
                const popupContent = `
                    <div class="text-xs max-w-[200px]">
                        <strong class="block text-sm uppercase">${ev.type}</strong>
                        <p class="my-1 text-[10px] text-slate-500" title="${safeAddress ? safeAddress : safeCorridor}">${safeAddress ? safeAddress : safeCorridor}</p>
                        <strong>Clear time: ${ev.formattedDuration}</strong>
                        ${dispatchEtaStr !== 'null' ? `<p class="my-1 text-[10px] text-blue-400 font-semibold">Dispatch ETA: ${dispatchEtaStr} mins (${dispatchDistStr} km)</p>` : ''}
                        <p class="mt-2 font-semibold text-emerald-600">${ev.advisory}</p>
                        ${ev.weatherAlert && ev.weatherAlert.includes("CRITICAL") ? `<p class="mt-2 font-bold text-red-500">${ev.weatherAlert}</p>` : ""}
                        <button type="button" onclick="assignToTracker('${ev.id}', { type: '${safeType}', corridor: '${safeCorridor}', cause: '${safeCause}', severity: '${safeSeverity}', formattedDuration: '${safeDuration}', isHotspot: ${isHotspotStr}, address: '${safeAddress}', dispatchEta: ${dispatchEtaStr}, dispatchDistance: ${dispatchDistStr}, lat: ${ev.lat}, lng: ${ev.lng} })" class="mt-3 block w-full border border-slate-700 bg-slate-800 px-1.5 py-1 text-[9px] font-bold uppercase text-slate-300 hover:text-white transition operator-only">
                            Assign to Tracker
                        </button>
                    </div>`;
                    
                L.circleMarker([ev.lat, ev.lng], {
                    radius: 6,
                    fillColor: "#64748b",
                    color: "#0f172a",
                    weight: 1,
                    fillOpacity: 0.8
                }).bindPopup(popupContent, { 
                    autoPan: true, 
                    keepInView: true,
                    autoPanPadding: [20, 20]
                }).addTo(globalMarkerGroup);
            });
        }

        function renderHeatmap() {
            if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
            if (!document.getElementById("toggleHeatmap").checked) return;

            const heatPoints = operationLedgerData.map(ev => [ev.lat, ev.lng, 1.0]);
            if (heatPoints.length > 0) {
                heatLayer = L.heatLayer(heatPoints, { radius: 12, blur: 15, maxZoom: 13 }).addTo(map);
            }
        }

        document.getElementById("toggleHeatmap").addEventListener("change", () => renderHeatmap());

        function renderActionPoints() {
            actionPointsLayer.clearLayers();
            if (!document.getElementById("toggleActionPoints").checked) return;

            const corridorIncidents = new Map();
            operationLedgerData.forEach(ev => {
                if (!ev.corridor || ev.corridor === "Non-corridor") return;
                if (!corridorIncidents.has(ev.corridor)) corridorIncidents.set(ev.corridor, []);
                corridorIncidents.get(ev.corridor).push(ev);
            });

            const ranked = Array.from(corridorIncidents.entries())
                .map(([corridor, items]) => ({
                    corridor,
                    totalDelay: items.reduce((s, i) => s + i.minutes, 0),
                    count: items.length,
                    representative: items.sort((a, b) => b.minutes - a.minutes)[0],
                    isHotspot: items.some(i => i.is_hotspot)
                }))
                .sort((a, b) => {
                    const delayA = a.isHotspot ? a.totalDelay * 1.5 : a.totalDelay;
                    const delayB = b.isHotspot ? b.totalDelay * 1.5 : b.totalDelay;
                    return delayB - delayA;
                })
                .slice(0, 10);

            ranked.forEach((zone, i) => {
                const ev = zone.representative;
                const cautionIcon = L.divIcon({
                    className: '',
                    html: `<div style="position:relative;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid #f59e0b;filter:drop-shadow(0 0 4px rgba(245,158,11,0.7));"><span style="position:absolute;top:5px;left:-3px;font-size:10px;font-weight:900;color:#0f172a;line-height:1;">!</span></div>`,
                    iconSize: [20, 18],
                    iconAnchor: [10, 18]
                });
                L.marker([ev.lat, ev.lng], { icon: cautionIcon })
                    .bindPopup(`<div style="max-width:240px">
                        <strong class="block text-xs mb-1">Chokepoint #${i + 1}: ${zone.corridor}</strong>
                        <p class="text-[10px]">Total delay: ${Math.round(zone.totalDelay)}m across ${zone.count} incident(s)</p>
                        <p class="text-[10px] mt-1 font-semibold text-red-600">Action: Deploy traffic management resources here to relieve surrounding network pressure.</p>
                        ${ev.advisory ? `<p class="text-[10px] mt-1 text-gray-500">${ev.advisory}</p>` : ''}
                    </div>`)
                    .addTo(actionPointsLayer);
            });
        }

        document.getElementById("toggleActionPoints").addEventListener("change", () => renderActionPoints());

        function updateAnalytics() {
            const corridorMap = new Map();
            let totalCauses = 0;
            const causeMap = new Map();

            operationLedgerData.forEach(item => {
                if (item.corridor && item.corridor !== "Non-corridor") {
                    corridorMap.set(item.corridor, (corridorMap.get(item.corridor) || 0) + item.minutes);
                }
                if (item.cause) {
                    causeMap.set(item.cause, (causeMap.get(item.cause) || 0) + 1);
                    totalCauses++;
                }
            });

            const sortedCorridors = Array.from(corridorMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const chokepointsList = document.getElementById("chokepointsList");
            if (sortedCorridors.length === 0) {
                chokepointsList.innerHTML = "<li>No active corridor delays</li>";
            } else {
                chokepointsList.innerHTML = sortedCorridors.map((c, i) => 
                    `<li><span class="text-emerald-500 mr-1">${i+1}.</span> ${c[0]} <span class="text-slate-500">(${Math.round(c[1])}m total delay)</span></li>`
                ).join("");
            }

            const distributionDiv = document.getElementById("resourceDistribution");
            if (totalCauses === 0) {
                distributionDiv.innerHTML = "No active resource demands";
            } else {
                const sortedCauses = Array.from(causeMap.entries()).sort((a, b) => b[1] - a[1]);
                distributionDiv.innerHTML = sortedCauses.map(c => {
                    const pct = Math.round((c[1] / totalCauses) * 100);
                    return `
                    <div class="flex justify-between items-center text-[10px]">
                        <span class="uppercase font-semibold">${c[0].replace(/_/g, " ")}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="w-full bg-slate-800 h-1 mt-0.5"><div class="bg-amber-500 h-1" style="width: ${pct}%"></div></div>
                    `;
                }).join("");
            }
        }

        function renderLedger() {
            const filterRisk = document.getElementById("filterRisk").value;

            let filtered = operationLedgerData.slice();
            if (filterRisk !== "All") {
                filtered = filtered.filter(item => item.severity === filterRisk);
            }

            filtered.sort((a, b) => {
                let valA = a[currentSortKey];
                let valB = b[currentSortKey];
                
                if (currentSortKey === 'id' || currentSortKey === 'type' || currentSortKey === 'severity') {
                    valA = valA.toString().toLowerCase();
                    valB = valB.toString().toLowerCase();
                    if (valA < valB) return currentSortDir === "asc" ? -1 : 1;
                    if (valA > valB) return currentSortDir === "asc" ? 1 : -1;
                    return 0;
                } else {
                    return currentSortDir === "asc" ? valA - valB : valB - valA;
                }
            });

            const tbody = document.getElementById("ledgerBody");
            tbody.innerHTML = "";
            filtered.forEach(item => tbody.appendChild(item.trElement));
            updateAnalytics();
            updateSortIndicators();
        }

        function formatTimestamp(timestampStr) {
            if (!timestampStr || timestampStr === "None") return "Just Now";
            const dt = new Date(timestampStr);
            if (isNaN(dt.getTime())) return "Just Now";
            const hours = dt.getHours().toString().padStart(2, '0');
            const mins = dt.getMinutes().toString().padStart(2, '0');
            const month = dt.toLocaleString('en-US', { month: 'short' });
            const day = dt.getDate();
            return `${hours}:${mins} | ${month} ${day}`;
        }

        function severityStyle(severity) {
            if (severity === "Low Impact") {
                return {
                    classes: "border-emerald-800 bg-emerald-950/30 text-emerald-400",
                    color: "#10b981"
                };
            }
            if (severity === "Moderate Delay") {
                return {
                    classes: "border-amber-800 bg-amber-950/30 text-amber-400",
                    color: "#f59e0b"
                };
            }
            return {
                classes: "border-red-800 bg-red-950/30 text-red-400",
                color: "#ef4444"
            };
        }

        function createPopup(event) {
            const wrapper = document.createElement("div");
            wrapper.className = "text-xs";

            const title = document.createElement("strong");
            title.className = "block text-sm";
            title.textContent = `${event.event_cause} - ${event.vehicle_type}`;

            const addressP = document.createElement("p");
            addressP.className = "my-1 text-[10px] text-slate-500";
            addressP.textContent = event.address ? event.address : event.corridor;

            const description = document.createElement("p");
            description.className = "my-2";
            description.textContent = event.description;

            const estimate = document.createElement("strong");
            estimate.textContent = `Clear time: ${event.formatted_duration}`;
            
            const dispatchP = document.createElement("p");
            dispatchP.className = "my-1 text-[10px] font-semibold text-blue-400";
            dispatchP.textContent = event.dispatch_eta ? `Dispatch ETA: ${event.dispatch_eta} mins (${event.dispatch_distance} km)` : "";

            const advisory = document.createElement("p");
            advisory.className = "mt-2 font-semibold text-emerald-600";
            advisory.textContent = event.action_advisory;

            const weatherAlert = document.createElement("p");
            weatherAlert.className = event.weather_alert && event.weather_alert.includes("CRITICAL") ? "mt-2 font-bold text-red-500" : "hidden";
            weatherAlert.textContent = event.weather_alert;

            wrapper.append(title, addressP, description, estimate, dispatchP, advisory, weatherAlert);
            return wrapper;
        }

        function setCustomMarker(latitude, longitude, popupText) {
            if (customMarker) map.removeLayer(customMarker);
            customMarker = L.marker([latitude, longitude]).addTo(map);
            customMarker.bindPopup(`
                <span class="font-bold uppercase text-slate-800 block mb-1">${popupText}</span>
                <button type="button" onclick="clearCustomMarker()" class="mt-1 block w-full bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 font-bold uppercase text-[9px] py-1 px-2 rounded">
                    Remove Marker
                </button>
            `, { 
                autoPan: true, 
                keepInView: true,
                autoPanPadding: [20, 20]
            }).openPopup();
            map.setView([latitude, longitude], 14);
        }

        function assignToTracker(id, data) {
            if (kanbanState.has(id)) return;
            kanbanState.set(id, 0);
            kanbanItemData.set(id, data);
            renderKanban();
            if (typeof showToast === 'function') {
                showToast("Incident added to Tracker", "info");
            }
            saveState();
        }

        let undoTimeout = null;
        let lastKanbanAction = null;
        let pendingConfirm = null;

        function requestKanbanAdvance(id, targetPhase) {
            const data = kanbanItemData.get(id);
            const currentPhase = kanbanState.get(id);
            if (currentPhase === undefined || targetPhase === currentPhase) return;

            const phaseNames = ["Awaiting Dispatch", "Response Unit Active", "Incident Resolved"];
            document.getElementById("confirmModalText").textContent =
                `Move "${data.type}" from "${phaseNames[currentPhase]}" to "${phaseNames[targetPhase]}"?`;
            pendingConfirm = { id, oldPhase: currentPhase, newPhase: targetPhase };
            const modal = document.getElementById("kanbanConfirmModal");
            modal.classList.remove("hidden");
            modal.classList.add("flex");
        }

        document.getElementById("confirmModalOk").addEventListener("click", () => {
            if (pendingConfirm) {
                if (pendingConfirm.action === "delete") {
                    kanbanState.delete(pendingConfirm.id);
                    kanbanItemData.delete(pendingConfirm.id);
                } else {
                    lastKanbanAction = { id: pendingConfirm.id, oldPhase: pendingConfirm.oldPhase };
                    kanbanState.set(pendingConfirm.id, pendingConfirm.newPhase);
                    showUndoSnackbar();
                    
                    if (pendingConfirm.newPhase === 1 && pendingConfirm.oldPhase === 0) {
                        const id = pendingConfirm.id;
                        setTimeout(() => {
                            const card = document.querySelector(`[data-kanban-id="${id}"]`);
                            if (card) {
                                const address = card.querySelector('.dispatch-address').textContent;
                                const cause = card.querySelector('.dispatch-cause').textContent;
                                const severity = card.querySelector('.dispatch-severity').textContent;
                                const etaStr = card.querySelector('.dispatch-eta').textContent;

                                if (etaStr && etaStr !== 'null') {
                                    fetch('/api/dispatch-alert', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            incident_cause: cause,
                                            severity: severity,
                                            address: address,
                                            eta: parseFloat(etaStr)
                                        })
                                    }).then(res => res.json()).then(resData => {
                                        if (resData.status === 'success') {
                                            card.style.borderColor = '#3b82f6';
                                            const badge = document.createElement('span');
                                            badge.className = 'absolute bottom-1 right-1 text-[8px] font-bold text-blue-400 bg-blue-900/50 px-1 rounded';
                                            badge.textContent = 'Alert Sent';
                                            card.appendChild(badge);
                                        }
                                    });
                                }
                            }
                        }, 50);
                    }
                }
                renderKanban();
                saveState();
            }
            pendingConfirm = null;
            document.getElementById("kanbanConfirmModal").classList.add("hidden");
            document.getElementById("kanbanConfirmModal").classList.remove("flex");
        });

        document.getElementById("confirmModalCancel").addEventListener("click", () => {
            pendingConfirm = null;
            document.getElementById("kanbanConfirmModal").classList.add("hidden");
            document.getElementById("kanbanConfirmModal").classList.remove("flex");
        });

        function advanceKanban(id) {
            const phase = kanbanState.get(id);
            if (phase < 2) {
                requestKanbanAdvance(id, phase + 1);
            }
        }

        function showUndoSnackbar() {
            const snackbar = document.getElementById("undoSnackbar");
            snackbar.classList.remove("hidden");
            snackbar.classList.add("flex");
            if (undoTimeout) clearTimeout(undoTimeout);
            undoTimeout = setTimeout(() => {
                snackbar.classList.add("hidden");
                snackbar.classList.remove("flex");
                lastKanbanAction = null;
            }, 5000);
        }

        document.getElementById("undoBtn").addEventListener("click", () => {
            if (lastKanbanAction) {
                kanbanState.set(lastKanbanAction.id, lastKanbanAction.oldPhase);
                renderKanban();
                saveState();
                document.getElementById("undoSnackbar").classList.add("hidden");
                document.getElementById("undoSnackbar").classList.remove("flex");
                if (undoTimeout) clearTimeout(undoTimeout);
                lastKanbanAction = null;
            }
        });

        function renderKanban() {
            document.getElementById("kanbanAwaiting").innerHTML = "";
            document.getElementById("kanbanActive").innerHTML = "";
            document.getElementById("kanbanResolved").innerHTML = "";

            kanbanState.forEach((phase, id) => {
                const data = kanbanItemData.get(id);
                const card = document.createElement("div");
                const isManualCard = id.startsWith("MANUAL-");
                card.className = `border ${isManualCard ? 'border-sky-700 bg-sky-950/30' : 'border-slate-700 bg-slate-950'} p-2 text-xs relative cursor-grab active:cursor-grabbing`;
                card.draggable = true;
                card.dataset.kanbanId = id;

                card.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", id);
                    e.dataTransfer.effectAllowed = "move";
                    card.style.opacity = "0.5";
                });
                card.addEventListener("dragend", () => { card.style.opacity = "1"; });
                
                let btnHtml = "";
                if (phase === 0) {
                    btnHtml = `<button onclick="advanceKanban('${id}')" class="mt-2 w-full border border-slate-700 bg-slate-800 py-1 text-[10px] font-semibold text-amber-500 hover:bg-slate-700">Dispatch Unit &rarr;</button>`;
                    document.getElementById("kanbanAwaiting").appendChild(card);
                } else if (phase === 1) {
                    btnHtml = `<button onclick="advanceKanban('${id}')" class="mt-2 w-full border border-slate-700 bg-slate-800 py-1 text-[10px] font-semibold text-emerald-500 hover:bg-slate-700">Resolve Incident &rarr;</button>`;
                    document.getElementById("kanbanActive").appendChild(card);
                } else if (phase === 2) {
                    btnHtml = `<span class="mt-2 block w-full text-center py-1 border border-slate-800 text-[10px] font-semibold text-slate-500">Completed</span>`;
                    document.getElementById("kanbanResolved").appendChild(card);
                }

                let hotzoneBadge = data.isHotspot ? '<span class="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white shadow shadow-red-500/50 animate-pulse">H</span>' : '';
                
                let addressText = data.address ? data.address : (data.lat !== undefined ? `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}` : data.corridor);
                let dispatchMetrics = data.dispatchEta ? `<span class="block mt-1 text-[9px] text-blue-300 font-medium">Dispatch Unit ETA: ${data.dispatchEta} mins (${data.dispatchDistance} km)</span>` : "";

                card.innerHTML = `
                    <button onclick="removeFromKanban('${id}')" class="absolute top-1 right-1 text-slate-600 hover:text-red-400 text-[10px] font-bold leading-none p-0.5" title="Remove from Tracker">&times;</button>
                    ${hotzoneBadge}
                    <span class="block font-bold uppercase truncate pr-4">${data.type}</span>
                    <span class="block text-[10px] text-slate-400 truncate" title="${addressText}">${addressText}</span>
                    ${dispatchMetrics}
                    <span class="block mt-1 font-mono text-emerald-400 text-[10px]">Clear Time: ${data.formattedDuration}</span>
                    <span class="hidden dispatch-address">${data.address || data.corridor}</span>
                    <span class="hidden dispatch-cause">${data.cause || 'Unknown'}</span>
                    <span class="hidden dispatch-severity">${data.severity || 'Unknown'}</span>
                    <span class="hidden dispatch-eta">${data.dispatchEta !== undefined && data.dispatchEta !== null ? data.dispatchEta : ''}</span>
                    ${btnHtml}
                `;
            });
        }

        window.removeFromKanban = function(id) {
            const data = kanbanItemData.get(id);
            document.getElementById("confirmModalText").textContent =
                `Remove "${data ? data.type : id}" from the Tracker permanently?`;
            pendingConfirm = { id, action: "delete" };
            const modal = document.getElementById("kanbanConfirmModal");
            modal.classList.remove("hidden");
            modal.classList.add("flex");
        };

        document.querySelectorAll(".kanban-drop").forEach(dropZone => {
            dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dropZone.style.outline = "2px solid #10b981";
            });
            dropZone.addEventListener("dragleave", () => {
                dropZone.style.outline = "";
            });
            dropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                dropZone.style.outline = "";
                const draggedId = e.dataTransfer.getData("text/plain");
                const targetPhase = parseInt(dropZone.closest(".kanban-col").dataset.phase);
                if (kanbanState.has(draggedId)) {
                    requestKanbanAdvance(draggedId, targetPhase);
                }
            });
        });

        function createTrElement(item, targetMarker = null) {
            const isManual = item.id.startsWith("MANUAL-");
            const style = severityStyle(item.severity);
            const weatherBadge = item.weatherAlert && item.weatherAlert.includes("CRITICAL") 
                ? `<span class="block mt-1 text-[9px] font-bold text-red-500">${item.weatherAlert}</span>` : "";

            const tr = document.createElement("tr");
            tr.className = `cursor-pointer transition ${isManual ? 'bg-sky-950/20 hover:bg-sky-950/40 border-l-2 border-l-sky-500' : 'hover:bg-slate-900'}`;
            tr.innerHTML = `
                <td class="py-2.5 pr-3 text-[10px]">
                    <span class="block font-mono text-emerald-400 mb-0.5">${item.timestampBadge}</span>
                    <span class="block text-slate-500 break-words">${item.id}</span>
                </td>
                <td class="py-2.5 pr-3 font-semibold uppercase break-words">${item.type}</td>
                <td class="py-2.5 pr-3 font-mono whitespace-nowrap">${item.formattedDuration}</td>
                <td class="py-2.5 pr-3"><span class="inline-block border px-1.5 py-0.5 ${style.classes} whitespace-nowrap text-[10px] leading-tight">${item.severity}</span></td>
                <td class="py-2.5 pr-3 text-slate-300">
                    ${item.advisory}${weatherBadge}
                    <button type="button" class="assign-btn operator-only mt-1 block border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-300 hover:text-white transition">Assign to Tracker</button>
                </td>
            `;

            tr.querySelector('.assign-btn').addEventListener("click", (e) => {
                e.stopPropagation();
                assignToTracker(item.id, { 
                    type: item.type, corridor: item.corridor, cause: item.cause, severity: item.severity, 
                    formattedDuration: item.formattedDuration, isHotspot: item.is_hotspot, address: item.address, 
                    dispatchEta: item.dispatchEta, dispatchDistance: item.dispatchDistance, lat: item.lat, lng: item.lng 
                });
                const btn = e.target;
                btn.textContent = "Assigned \u2713";
                btn.classList.add("text-emerald-400", "border-emerald-700");
                btn.disabled = true;
            });

            tr.addEventListener("click", () => {
                if (targetMarker && liveMarkers.hasLayer(targetMarker)) {
                    liveMarkers.zoomToShowLayer(targetMarker, function() {
                        targetMarker.openPopup();
                    });
                } else {
                    map.setView([item.lat, item.lng], 14);
                    setCustomMarker(item.lat, item.lng, item.popupHtml);
                }
            });
            
            return tr;
        }

        function addLedgerEntry(id, type, corridor, cause, minutes, formattedDuration, severity, advisory, weatherAlertText, timestampBadge, lat, lng, popupHtml, targetMarker = null, isHotspot = false, address = null, dispatchEta = null, dispatchDistance = null) {
            if (operationLedger.has(id)) return;
            operationLedger.set(id, true);
            
            const newItem = {
                id,
                type,
                corridor,
                cause,
                severity,
                minutes,
                formattedDuration,
                advisory,
                weatherAlert: weatherAlertText,
                timestampBadge,
                popupHtml,
                lat,
                lng,
                orderIndex: ++orderCounter,
                is_hotspot: isHotspot,
                address: address,
                dispatchEta: dispatchEta,
                dispatchDistance: dispatchDistance
            };
            
            newItem.trElement = createTrElement(newItem, targetMarker);
            operationLedgerData.push(newItem);

            renderLedger();
            renderHeatmap();
            if (document.getElementById("toggleGlobalView").checked) renderGlobalView();
            renderActionPoints();
            saveState();
        }

        map.on("click", (event) => {
            if (!localStorage.getItem("meridian_auth")) return; // Only operators can place custom pins
            document.getElementById("latitude").value = event.latlng.lat.toFixed(6);
            document.getElementById("longitude").value = event.latlng.lng.toFixed(6);
            document.getElementById("corridor").value = detectCorridor(event.latlng.lat, event.latlng.lng);
            setCustomMarker(event.latlng.lat, event.latlng.lng, "Custom incident location");
        });

        document.getElementById("predictForm").addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitButton = document.getElementById("submitButton");
            submitButton.disabled = true;
            submitButton.textContent = "Evaluating...";

            const payload = {
                latitude: parseFloat(document.getElementById("latitude").value),
                longitude: parseFloat(document.getElementById("longitude").value),
                vehicle_type: document.getElementById("vehicleType").value,
                corridor: document.getElementById("corridor").value,
                priority: document.getElementById("priority").value,
                event_cause: document.getElementById("eventCause").value,
                description: document.getElementById("description").value,
                weather: activeWeatherPayload,
            };

            try {
                const response = await fetch("/predict", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) {
                    const detail = Array.isArray(result.detail)
                        ? result.detail.map((item) => item.msg).join(", ")
                        : result.detail;
                    throw new Error(detail || "Prediction request failed.");
                }

                const style = severityStyle(result.severity_level);
                document.getElementById("resultsPanel").classList.remove("hidden");
                document.getElementById("predictedMinutes").textContent = result.formatted_duration;

                const severityText = document.getElementById("severityText");
                severityText.textContent = result.severity_level;
                severityText.className = `border px-2 py-1 text-right text-xs ${style.classes}`;
                
                document.getElementById("advisoryText").textContent = result.action_advisory;

                document.getElementById("addressText").textContent = result.address || "Unknown Address";
                document.getElementById("addressText").title = result.address || "Unknown Address";
                if (result.dispatch_eta) {
                    document.getElementById("dispatchText").textContent = `${result.dispatch_eta} mins (${result.dispatch_distance} km)`;
                } else {
                    document.getElementById("dispatchText").textContent = "N/A";
                }

                if (result.weather_alert && result.weather_alert.includes("CRITICAL")) {
                    document.getElementById("weatherAlertContainer").classList.remove("hidden");
                    document.getElementById("weatherAlertText").textContent = result.weather_alert;
                } else {
                    document.getElementById("weatherAlertContainer").classList.add("hidden");
                }

                const popupHtml = `<strong>Manual Input</strong><p class="my-1 text-[10px] text-slate-500">${result.address || payload.corridor}</p><p class="my-2">${result.description}</p><strong>Clear time: ${result.formatted_duration}</strong>` +
                    (result.dispatch_eta ? `<p class="my-1 text-[10px] text-blue-400 font-semibold">Dispatch ETA: ${result.dispatch_eta} mins (${result.dispatch_distance} km)</p>` : "") +
                    `<p class="mt-2 font-semibold text-emerald-600">${result.action_advisory}</p>` +
                    (result.weather_alert && result.weather_alert.includes("CRITICAL") ? `<p class="mt-2 font-bold text-red-500">${result.weather_alert}</p>` : "");
                setCustomMarker(
                    payload.latitude,
                    payload.longitude,
                    popupHtml
                );
                
                const incidentType = `${payload.event_cause.replace(/_/g, " ")} - ${payload.vehicle_type.replace(/_/g, " ")}`;
                const manualId = `MANUAL-${new Date().toLocaleTimeString().replace(/:/g, "").split(" ")[0]}`;
                
                addLedgerEntry(
                    manualId, 
                    incidentType, 
                    payload.corridor,
                    payload.event_cause,
                    result.predicted_duration_minutes, 
                    result.formatted_duration,
                    result.severity_level, 
                    result.action_advisory, 
                    result.weather_alert,
                    formatTimestamp(result.start_datetime),
                    payload.latitude, 
                    payload.longitude, 
                    popupHtml,
                    customMarker,
                    result.is_hotspot,
                    result.address,
                    result.dispatch_eta,
                    result.dispatch_distance
                );
                
                assignToTracker(manualId, { type: incidentType, corridor: payload.corridor, formattedDuration: result.formatted_duration, isHotspot: result.is_hotspot, address: result.address, dispatchEta: result.dispatch_eta, dispatchDistance: result.dispatch_distance, lat: payload.latitude, lng: payload.longitude });
            } catch (error) {
                showToast(`Prediction failed: ${error.message}`);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Evaluate and Log to Ledger";
            }
        });

        async function refreshLiveFeed() {
            if (feedRequestActive) return;
            feedRequestActive = true;

            const status = document.getElementById("feedStatus");
            const dot = document.getElementById("feedDot");
            const refreshButton = document.getElementById("refreshFeed");
            status.textContent = "LIVE FEED SYNCING";
            dot.className = "h-2.5 w-2.5 bg-amber-400";
            refreshButton.disabled = true;

            const container = document.getElementById("liveAlerts");
            
            try {
                const response = await fetch(`/api/live-events?weather=${activeWeatherPayload}`, { cache: "no-store" });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || "Live feed unavailable.");

                let openPopupIncidentId = null;
                liveMarkers.eachLayer(layer => {
                    if (layer.isPopupOpen && layer.isPopupOpen()) {
                        openPopupIncidentId = layer._incidentId || null;
                    }
                });

                container.replaceChildren();
                liveMarkers.clearLayers();
                let reopenMarker = null;

                data.events.slice().reverse().forEach((incident) => {
                    const style = severityStyle(incident.severity_level);
                    const card = document.createElement("div");
                    card.className =
                        `w-[calc(33.333%-6px)] flex-shrink-0 flex-grow-0 flex min-h-32 flex-col border p-3 text-left transition hover:border-slate-500 ${style.classes}`;

                    const headerRow = document.createElement("div");
                    headerRow.className = "flex justify-between items-start mb-1";
                    
                    const heading = document.createElement("span");
                    heading.className = "text-xs font-bold uppercase";
                    heading.textContent = incident.event_cause;
                    
                    const timeBadge = document.createElement("span");
                    timeBadge.className = "text-[10px] font-mono text-emerald-400";
                    timeBadge.textContent = formatTimestamp(incident.start_datetime);
                    
                    headerRow.append(heading, timeBadge);

                    const location = document.createElement("span");
                    location.className = "text-[10px] text-slate-400 truncate";
                    location.textContent = incident.address ? incident.address : incident.corridor;
                    location.title = incident.address ? incident.address : incident.corridor;

                    const dispatchInfo = document.createElement("span");
                    dispatchInfo.className = "mt-1 text-[9px] font-semibold text-blue-400";
                    dispatchInfo.textContent = incident.dispatch_eta ? `Dispatch ETA: ${incident.dispatch_eta} mins (${incident.dispatch_distance} km)` : "";

                    const description = document.createElement("span");
                    description.className = "mt-2 line-clamp-2 text-xs text-slate-300";
                    description.textContent = incident.description;

                    const estimate = document.createElement("span");
                    estimate.className = "mt-auto pt-2 text-right font-mono text-sm font-bold";
                    estimate.textContent = incident.formatted_duration;

                    const assignBtn = document.createElement("button");
                    assignBtn.className = "mt-2 block border border-slate-700 bg-slate-800 px-1.5 py-1 text-[9px] font-bold uppercase text-slate-300 hover:text-white transition w-max operator-only";
                    assignBtn.textContent = "Assign to Tracker";
                    assignBtn.onclick = (e) => {
                        e.stopPropagation();
                        assignToTracker(incident.id, { type: incident.event_cause, corridor: incident.corridor, cause: incident.event_cause, severity: incident.severity_level, formattedDuration: incident.formatted_duration, isHotspot: incident.is_hotspot, address: incident.address, dispatchEta: incident.dispatch_eta, dispatchDistance: incident.dispatch_distance, lat: incident.latitude, lng: incident.longitude });
                    };

                    card.append(headerRow, location, dispatchInfo, description, estimate, assignBtn);

                    const marker = L.circleMarker(
                        [incident.latitude, incident.longitude],
                        {
                            radius: 8,
                            fillColor: style.color,
                            color: "#020617",
                            weight: 2,
                            fillOpacity: 0.9
                        }
                    ).addTo(liveMarkers);
                    marker._incidentId = incident.id;
                    
                    const popupElement = createPopup(incident);
                    marker.bindPopup(popupElement, { 
                        autoPan: true, 
                        keepInView: true,
                        autoPanPadding: [20, 20]
                    });

                    if (openPopupIncidentId && incident.id === openPopupIncidentId) {
                        reopenMarker = marker;
                    }

                    card.addEventListener("click", () => {
                        liveMarkers.zoomToShowLayer(marker, function() {
                            marker.openPopup();
                        });
                    });
                    
                    card.style.cursor = "pointer";
                    container.insertBefore(card, container.firstChild);
                    
                    addLedgerEntry(
                        incident.id,
                        `${incident.event_cause} - ${incident.vehicle_type}`,
                        incident.corridor,
                        incident.event_cause,
                        incident.predicted_duration_minutes,
                        incident.formatted_duration,
                        incident.severity_level,
                        incident.action_advisory,
                        incident.weather_alert,
                        formatTimestamp(incident.start_datetime),
                        incident.latitude,
                        incident.longitude,
                        popupElement.outerHTML,
                        marker,
                        incident.is_hotspot,
                        incident.address,
                        incident.dispatch_eta,
                        incident.dispatch_distance
                    );
                });

                if (reopenMarker) {
                    map.panTo(reopenMarker.getLatLng(), { animate: true });
                    reopenMarker.openPopup();
                }

                status.textContent = `LIVE FEED SYNCED - ${new Date().toLocaleTimeString()}`;
                dot.className = "h-2.5 w-2.5 bg-emerald-500";
            } catch (error) {
                status.textContent = "LIVE FEED INTERRUPTED";
                dot.className = "h-2.5 w-2.5 bg-red-500";
                console.error(error);
            } finally {
                feedRequestActive = false;
                refreshButton.disabled = false;
                applyAuthView(); // ensure dynamic buttons are correctly hidden/shown
            }
        }

        function toggleAuthModal() {
            const modal = document.getElementById("loginModal");
            if (modal.classList.contains("hidden")) {
                modal.classList.remove("hidden");
                modal.classList.add("flex");
                document.getElementById("loginUser").focus();
            } else {
                modal.classList.add("hidden");
                modal.classList.remove("flex");
            }
        }

        document.getElementById("authBtn").addEventListener("click", () => {
            if (localStorage.getItem("meridian_auth")) {
                localStorage.removeItem("meridian_auth");
                applyAuthView();
                showToast("Logged out successfully.", "info");
            } else {
                toggleAuthModal();
            }
        });

        document.getElementById("loginForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const u = document.getElementById("loginUser").value;
            const p = document.getElementById("loginPass").value;
            try {
                const params = new URLSearchParams();
                params.append("username", u);
                params.append("password", p);
                
                const res = await fetch("/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params
                });
                
                if (!res.ok) throw new Error("Invalid credentials");
                const data = await res.json();
                localStorage.setItem("meridian_auth", data.access_token);
                document.getElementById("loginModal").classList.add("hidden");
                document.getElementById("loginModal").classList.remove("flex");
                applyAuthView();
                showToast("Logged in as Operator.", "info");
                document.getElementById("loginForm").reset();
            } catch (error) {
                showToast(error.message);
            }
        });

        function applyAuthView() {
            const isAuth = !!localStorage.getItem("meridian_auth");
            document.getElementById("authBtn").textContent = isAuth ? "LOGOUT" : "LOGIN";
            
            // Toggle visibility of operator-only elements
            document.querySelectorAll(".operator-only").forEach(el => {
                el.style.display = isAuth ? "" : "none"; // Using empty string to revert to natural display property
            });
            
            // Adjust main grid columns if form is hidden
            const mainGrid = document.querySelector("main");
            if (isAuth) {
                mainGrid.classList.add("lg:grid-cols-12");
                mainGrid.classList.remove("lg:grid-cols-9");
            } else {
                mainGrid.classList.remove("lg:grid-cols-12");
                mainGrid.classList.add("lg:grid-cols-9"); // Adjust ratio when aside is gone
            }

            // Fix Leaflet gray areas when container size changes
            setTimeout(() => {
                if (typeof map !== 'undefined' && map !== null) {
                    map.invalidateSize();
                }
            }, 50);
        }

        // Initialize auth view on load
        applyAuthView();
        
        // Load persistent state
        loadState();

        document.getElementById("refreshFeed").addEventListener("click", refreshLiveFeed);
        refreshLiveFeed();
        setInterval(() => {
            if (!document.hidden) refreshLiveFeed();
        }, 12000);
    