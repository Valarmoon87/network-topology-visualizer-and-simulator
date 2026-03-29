const state = {
    devices: [],
    connections: [],
    selectedDeviceId: null,
    isSimulating: false,
    currentTask: null,
    nextId: 1,
    detectedTopologyName: 'None',
    simTimeout: null
};

// Device Configuration Data
const deviceDict = {
    pc: { icon: '<img src="assets/pc.png" class="d3-icon" alt="PC">', color: '#10b981', type: 'endpoint' },
    server: { icon: '<img src="assets/server.png" class="d3-icon" alt="Server">', color: '#059669', type: 'endpoint' },
    switch: { icon: '<img src="assets/switch.png" class="d3-icon" alt="Switch">', color: '#2563eb', type: 'core' },
    router: { icon: '<img src="assets/router.png" class="d3-icon" alt="Router">', color: '#dc2626', type: 'core' },
    hub: { icon: '<img src="assets/hub.png" class="d3-icon" alt="Hub">', color: '#d97706', type: 'core' },
    bridge: { icon: '<img src="assets/bridge.png" class="d3-icon" alt="Bridge">', color: '#4f46e5', type: 'core' },
    ap: { icon: '<img src="assets/ap.png" class="d3-icon" alt="AP">', color: '#0891b2', type: 'core' },
    firewall: { icon: '<img src="assets/firewall.png" class="d3-icon" alt="Firewall">', color: '#be123c', type: 'core' },
    modem: { icon: '<img src="assets/modem.png" class="d3-icon" alt="Modem">', color: '#475569', type: 'core' }
};

// Topology Knowledge Base
const topologyData = {
    'Star': {
        desc: 'All devices are connected to a central hub or switch.',
        how: 'End devices (PCs, Servers) link directly to ONE central core device.',
        adv: ['Easy to install and manage.', 'Failure of one cable does not affect others.', 'Easy to detect faults.']
    },
    'Bus': {
        desc: 'Devices share a single communication line or backbone (represented here by linked switches/hubs).',
        how: 'Core devices are linearly connected end-to-end.',
        adv: ['Cost-effective for small networks.', 'Easy to connect a device to the linear backbone.']
    },
    'Ring': {
        desc: 'Devices are connected in a closed-loop circle.',
        how: 'Core devices form a continuous cycle where each device connects to exactly two others.',
        adv: ['Data flows in one direction, reducing collisions.', 'Equal access for all computers.']
    },
    'Mesh': {
        desc: 'Devices are interconnected with multiple redundant paths.',
        how: 'Core devices have multiple connections to each other, forming a web.',
        adv: ['High redundancy and reliability.', 'If one path fails, another can be used.']
    },
    'Star-Bus': {
        desc: 'A hybrid topology combining Star and Bus networks.',
        how: 'Multiple Star networks are connected together via a linear Bus backbone.',
        adv: ['Highly scalable.', 'Easy to troubleshoot and manage individual branches.']
    },
    'Star-Ring': {
        desc: 'A hybrid topology combining Star and Ring structured networks.',
        how: 'Star networks are connected through a central Ring backbone.',
        adv: ['Good performance with heavy traffic.', 'Fault tolerance in the ring backbone.']
    },
    'Star-Mesh': {
        desc: 'A highly robust hybrid combining the central nodes of Star networks into a Mesh.',
        how: 'End devices connect to central switches (Star), and those switches are interconnected redundantly (Mesh).',
        adv: ['Extreme reliability.', 'Scalable for large enterprise networks.']
    }
};

// DOM Elements
const canvas = document.getElementById('canvas');
const svg = document.getElementById('connection-svg');
const topologyDetectSpan = document.getElementById('topology-detect');
const btnShowTopoInfo = document.getElementById('btn-show-topology-info');
const explanationPanel = document.getElementById('explanation-panel');
const explanationText = document.getElementById('explanation-text');
const explTitle = document.getElementById('expl-title');
const toastContainer = document.getElementById('toast-container');
const btnSimulate = document.getElementById('btn-simulate');
const btnClear = document.getElementById('btn-clear');
const celebrationScreen = document.getElementById('celebration-screen');
const celebrationMsg = document.getElementById('celebration-msg');
const currentTaskLabel = document.getElementById('current-task');
const btnVerifyTask = document.getElementById('btn-verify-task');

// --- SIDEBAR "CLICK-TO-PLACE" & DRAG SYSTEM ---
let activeSidebarSelection = null; 

document.querySelectorAll('.device-item').forEach(item => {
    // 1. Click-to-Place (Cisco Packet Tracer Style) - FOOLPROOF
    item.addEventListener('click', () => {
        document.querySelectorAll('.device-item').forEach(d => d.style.background = '');
        item.style.background = 'rgba(16, 185, 129, 0.2)';
        activeSidebarSelection = item.dataset.type.toLowerCase();
        showToast(`Selected ${item.dataset.type.toUpperCase()}. Click anywhere on canvas to drop!`, 'info');
    });

    // 2. Standard HTML5 Drag (Fallback)
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.type.toLowerCase());
    });
});

// Canvas Drop & Click Handlers
canvas.addEventListener('dragover', e => e.preventDefault());

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type || !deviceDict[type]) return;

    const rect = canvas.getBoundingClientRect();
    addDevice(type, e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('click', (e) => {
    if (activeSidebarSelection) {
        // Prevent placing if clicking ON an existing device
        if (e.target.closest('.canvas-device')) return;

        const rect = canvas.getBoundingClientRect();
        addDevice(activeSidebarSelection, e.clientX - rect.left, e.clientY - rect.top);
        
        // Auto-deselect after placing one device for safety
        activeSidebarSelection = null;
        document.querySelectorAll('.device-item').forEach(d => d.style.background = '');
    }
});


// --- GLOBAL CANVAS DEVICE DRAGGING SYSTEM ---
let draggingElement = null;
let draggingDeviceObj = null;
let wasMoved = false;

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    const deleteBtn = e.target.closest('.device-delete-btn');
    if (deleteBtn) return; // Let delete logic handle itself

    const el = e.target.closest('.canvas-device');
    if (!el) return;

    draggingElement = el;
    draggingDeviceObj = state.devices.find(d => d.id === el.dataset.id);
    wasMoved = false;
});

document.addEventListener('mousemove', (e) => {
    if (!draggingElement || !draggingDeviceObj) return;
    
    wasMoved = true;
    const canvasRect = canvas.getBoundingClientRect();
    
    // Lock to canvas boundaries visually
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Calculate new position relative to canvas
    let newX = e.clientX - canvasRect.left;
    let newY = e.clientY - canvasRect.top;

    // Constrain device position within canvas boundaries
    newX = Math.max(30, Math.min(newX, canvas.clientWidth - 30));
    newY = Math.max(30, Math.min(newY, canvas.clientHeight - 30));

    draggingDeviceObj.x = newX;
    draggingDeviceObj.y = newY;
    
    draggingElement.style.left = `${newX}px`;
    draggingElement.style.top = `${newY}px`;
    
    updateConnections();
});

document.addEventListener('mouseup', (e) => {
    if (draggingElement) {
        // If it was just a clean click (no actual drag movement), handle selection/connection mapping
        if (!wasMoved) {
            const el = draggingElement;
            const device = draggingDeviceObj;
            
            if (state.selectedDeviceId === device.id) {
                state.selectedDeviceId = null;
                el.classList.remove('selected');
            } else {
                if (state.selectedDeviceId) {
                    // Another device was selected -> CONNECT THEM
                    connectDevices(state.selectedDeviceId, device.id);
                    state.selectedDeviceId = null;
                    document.querySelectorAll('.canvas-device').forEach(d => d.classList.remove('selected'));
                } else {
                    // First device selection
                    document.querySelectorAll('.canvas-device').forEach(d => d.classList.remove('selected'));
                    el.classList.add('selected');
                    state.selectedDeviceId = device.id;
                }
            }
        }

        draggingElement = null;
        draggingDeviceObj = null;
    }
});

function addDevice(type, x, y) {
    const id = 'dev_' + state.nextId++;
    const config = deviceDict[type]; // Get device config
    
    // Constrain initial placement within canvas boundaries
    x = Math.max(30, Math.min(x, canvas.clientWidth - 30));
    y = Math.max(30, Math.min(y, canvas.clientHeight - 30));

    const device = { id, type, x, y, connections: [] };
    state.devices.push(device);

    const el = document.createElement('div');
    el.className = `canvas-device`;
    el.dataset.id = id;
    el.dataset.type = type;
    
    // Add device delete button along with icon
    el.innerHTML = config.icon + '<button class="device-delete-btn" title="Delete Device"><i class="fa-solid fa-trash"></i></button>';
    el.style.color = config.color;
    // border match icon color slightly
    el.style.border = `2px solid ${config.color}33`; // 20% opacity hex
    
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    // Setup delete action
    const deleteBtn = el.querySelector('.device-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDevice(id);
    });

    // setupDeviceInteraction(el, device); // This is now handled by the global system
    canvas.appendChild(el);
    detectTopology();
    
    showDropSuggestion(type);
}

function showDropSuggestion(type) {
    let suggestion = '';
    switch(type) {
        case 'pc':
        case 'server':
            suggestion = "You've added an endpoint. Connect it to a Switch or Hub to let it communicate with other computers!";
            break;
        case 'modem':
            suggestion = "A Modem connects you to the internet. For security, it's best to connect it directly to a Firewall or Router next.";
            break;
        case 'router':
            suggestion = "A Router routes traffic between different networks. Connect one side to a Modem, and the other to a Switch for your local devices.";
            break;
        case 'firewall':
            suggestion = "Great choice for security! Place the Firewall between your outer Modem and inner Router/Switch to filter malicious traffic.";
            break;
        case 'switch':
        case 'hub':
            suggestion = "You've added a central core device! You can now start connecting multiple PCs or Servers to it to form a 'Star' topology.";
            break;
        case 'ap':
            suggestion = "An Access Point provides Wi-Fi. It should be wired into a Switch so wireless devices can access the rest of the network.";
            break;
    }
    
    if (suggestion) {
        showExplanation(`Added ${type.toUpperCase()}`, suggestion, 'info-hint');
    }
}

function setupDeviceInteraction(el, device) {
    // Obsolete - All interactions managed flawlessly by the Global Canvas System.
}

function handleDeviceClick(id) {
    if (state.selectedDeviceId === id) {
        document.querySelector(`.canvas-device[data-id="${id}"]`).classList.remove('selected');
        state.selectedDeviceId = null;
        return;
    }

    if (!state.selectedDeviceId) {
        state.selectedDeviceId = id;
        document.querySelector(`.canvas-device[data-id="${id}"]`).classList.add('selected');
    } else {
        connectDevices(state.selectedDeviceId, id);
        const prevSelected = document.querySelector(`.canvas-device[data-id="${state.selectedDeviceId}"]`);
        if (prevSelected) prevSelected.classList.remove('selected');
        state.selectedDeviceId = null;
    }
}

// Connection Rules & Labels Knowledge Base
function analyzeConnectionPair(typeA, typeB) {
    const pair = [typeA, typeB].sort().join('-');
    
    // Wireless
    if (pair === 'ap-pc' || pair === 'ap-server') {
        return { isValid: true, label: 'Wireless Connection', class: 'wireless-line' };
    }
    
    // WAN
    if (pair === 'router-router' || pair === 'modem-router' || pair === 'firewall-modem') {
        return { isValid: true, label: 'WAN Connection', class: 'wan-line' };
    }
    
    // Invalid definitions
    if (pair === 'pc-pc') return { isValid: false, msg: "Invalid connection: PC cannot directly connect to another PC. Use a switch or hub." };
    if (pair === 'server-server') return { isValid: false, msg: "Invalid connection: Servers cannot connect directly. Use a switch." };
    if (pair === 'modem-pc' || pair === 'modem-server') return { isValid: false, msg: "Invalid connection: Modems do not connect directly to endpoints. Use a Router." };
    if (pair === 'firewall-pc') return { isValid: false, msg: "Invalid connection: Firewalls typically don't connect directly to a single PC. Use a Switch." };
    if (pair === 'ap-ap') return { isValid: false, msg: "Invalid connection: Access points do not wire to each other directly in most basic deployments." };
    if (pair === 'bridge-pc' || pair === 'bridge-server') return { isValid: false, msg: "Invalid connection: Bridges connect network segments (Switches/Hubs), not endpoints." };
    if (pair === 'modem-switch' || pair === 'modem-hub') return { isValid: false, msg: "Invalid connection: A Router/Firewall must exist between a Modem and a Switch/Hub." };

    // Default valid LAN
    return { isValid: true, label: 'LAN Connection', class: 'lan-line' };
}

function connectDevices(id1, id2) {
    if (id1 === id2) return;

    if (state.connections.some(c => (c.source === id1 && c.target === id2) || (c.source === id2 && c.target === id1))) {
        showToast('Devices are already connected.', 'error');
        return;
    }

    const dev1 = state.devices.find(d => d.id === id1);
    const dev2 = state.devices.find(d => d.id === id2);

    const check = analyzeConnectionPair(dev1.type, dev2.type);

    if (!check.isValid) {
        showExplanation('Connection Blocked', check.msg, 'error-hint');
        document.querySelector(`.canvas-device[data-id="${id1}"]`).classList.add('error');
        document.querySelector(`.canvas-device[data-id="${id2}"]`).classList.add('error');
        setTimeout(() => {
            document.querySelector(`.canvas-device[data-id="${id1}"]`)?.classList.remove('error');
            document.querySelector(`.canvas-device[data-id="${id2}"]`)?.classList.remove('error');
        }, 1000);
        showToast('Invalid Connection!', 'error');
        return; // Block the connection entirely as requested
    }

    const newConnection = { 
        source: id1, target: id2, 
        isError: false, 
        label: check.label, 
        lineClass: check.class 
    };
    
    state.connections.push(newConnection);
    dev1.connections.push(id2);
    dev2.connections.push(id1);

    showExplanation('Valid Link', `Successfully linked ${dev1.type.toUpperCase()} to ${dev2.type.toUpperCase()}. Established ${check.label}.`, 'success-hint');

    updateConnections();
    detectTopology();
}

function showExplanation(title, text, typeClass = '') {
    explTitle.innerText = title;
    explanationText.innerText = text;
    explanationPanel.className = `explanation-panel ${typeClass}`;
    
    // Auto hide
    setTimeout(() => {
        explanationPanel.classList.add('hidden');
    }, 8000);
}

document.getElementById('close-explanation').addEventListener('click', () => {
    explanationPanel.classList.add('hidden');
});

// Delete Device Logic
function deleteDevice(id) {
    // 1. Remove device object
    state.devices = state.devices.filter(d => d.id !== id);
    
    // 2. Remove all connections related to it
    state.connections = state.connections.filter(c => c.source !== id && c.target !== id);
    
    // 3. Remove connection references from remaining devices
    state.devices.forEach(d => {
        d.connections = d.connections.filter(connId => connId !== id);
    });
    
    // 4. Reset selection if the deleted device was selected
    if (state.selectedDeviceId === id) {
        state.selectedDeviceId = null;
    }
    
    // 5. Remove DOM element
    const el = document.querySelector(`.canvas-device[data-id="${id}"]`);
    if (el) el.remove();
    
    // 6. Update visuals
    updateConnections();
    detectTopology();
    showToast('Device removed.', 'success');
}

function deleteConnection(id1, id2) {
    // 1. Remove from global connections
    state.connections = state.connections.filter(c => !(c.source === id1 && c.target === id2) && !(c.source === id2 && c.target === id1));
    
    // 2. Remove from individual devices
    const dev1 = state.devices.find(d => d.id === id1);
    const dev2 = state.devices.find(d => d.id === id2);
    if(dev1) dev1.connections = dev1.connections.filter(id => id !== id2);
    if(dev2) dev2.connections = dev2.connections.filter(id => id !== id1);

    updateConnections();
    detectTopology();
    showToast('Connection removed.', 'success');
}

function updateConnections() {
    svg.innerHTML = '';

    state.connections.forEach(conn => {
        const source = state.devices.find(d => d.id === conn.source);
        const target = state.devices.find(d => d.id === conn.target);
        if(!source || !target) return;

        // Visual Segment
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dStr = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        path.setAttribute('d', dStr);
        path.setAttribute('class', `connection-line ${conn.lineClass || ''}`);
        svg.appendChild(path);

        // Invisible Hover/Click Hitbox Overlay mapping perfectly to the line
        const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitbox.setAttribute('d', dStr);
        hitbox.setAttribute('class', `connection-hitbox`);
        hitbox.style.stroke = 'transparent';
        hitbox.style.strokeWidth = '20'; // 20px wide transparent click zone
        hitbox.style.fill = 'none';
        
        // Add interactivity to the invisible hitbox
        hitbox.addEventListener('mouseenter', () => path.classList.add('hovered'));
        hitbox.addEventListener('mouseleave', () => path.classList.remove('hovered'));
        hitbox.addEventListener('click', (e) => {
            e.stopPropagation(); // don't trigger canvas click
            deleteConnection(conn.source, conn.target);
        });
        
        svg.appendChild(hitbox);

        // Label Text
        if (conn.label) {
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2 - 10; // offset slightly above the line
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY);
            text.setAttribute('class', 'connection-label');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = conn.label;
            svg.appendChild(text);
        }

        if (state.isSimulating) {
            drawSimulationDot(dStr, path);
        }
    });
}

function drawSimulationDot(pathData, pathElement) {
    const forwardDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    forwardDot.setAttribute('class', 'data-dot');
    forwardDot.setAttribute('r', '5');
    
    const animFwd = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    animFwd.setAttribute('dur', '2s');
    animFwd.setAttribute('repeatCount', 'indefinite');
    animFwd.setAttribute('path', pathData);
    
    forwardDot.appendChild(animFwd);
    svg.appendChild(forwardDot);
}

// Topology Detection Algorithm (Advanced)
function detectTopology() {
    let type = 'None';
    
    // Filter out invalid connections
    const validConns = state.connections.filter(c => !c.isError);
    
    // Map of nodes and their valid adjacencies
    const adj = {};
    state.devices.forEach(d => adj[d.id] = []);
    validConns.forEach(c => {
        adj[c.source].push(c.target);
        adj[c.target].push(c.source);
    });

    // Identify Core vs Edge
    const coreNodes = state.devices.filter(d => deviceDict[d.type].type === 'core').map(d => d.id);
    const edgeNodes = state.devices.filter(d => deviceDict[d.type].type === 'endpoint').map(d => d.id);

    // If there are no valid core nodes but devices are connected, it's mostly invalid/raw.
    if (coreNodes.length > 0 && validConns.length > 0) {
        
        // Analyze Core Graph
        const coreAdj = {};
        coreNodes.forEach(n => coreAdj[n] = []);
        validConns.forEach(c => {
            if (coreNodes.includes(c.source) && coreNodes.includes(c.target)) {
                coreAdj[c.source].push(c.target);
                coreAdj[c.target].push(c.source);
            }
        });

        const coreDegrees = Object.values(coreAdj).map(arr => arr.length);
        const maxCoreDeg = Math.max(...(coreDegrees.length ? coreDegrees : [0]));
        const coreEdges = validConns.filter(c => coreNodes.includes(c.source) && coreNodes.includes(c.target)).length;
        
        let coreTopo = 'None';
        
        if (coreNodes.length === 1) {
            coreTopo = 'Point';
        } else if (coreNodes.length > 1) {
            // Check Ring: all core nodes have degree 2, coreEdges == coreNodes (single connected component assumed for simplicity)
            if (coreDegrees.every(d => d === 2) && coreEdges === coreNodes.length) {
                coreTopo = 'Ring';
            } 
            // Check Mesh: Edges > nodes (contains cycles), max degree >=3
            else if (coreEdges > coreNodes.length || (coreEdges === coreNodes.length && maxCoreDeg >= 3)) {
                coreTopo = 'Mesh';
            }
            // Check Bus: no cycles (edges = nodes-1), max degree <= 2
            else if (coreEdges === coreNodes.length - 1 && maxCoreDeg <= 2) {
                coreTopo = 'Bus';
            }
            // Partial Mesh or others default to Mesh if highly connected
            else if (coreEdges >= coreNodes.length - 1) {
                coreTopo = 'Mesh'; // loose fallback
            }
        }

        // Analyze stars (endpoints connected to cores)
        // Does any core node have >= 2 endpoints connected to it?
        let hasStars = false;
        let starCenters = 0;
        coreNodes.forEach(coreId => {
            const endpointsAttached = adj[coreId].filter(id => edgeNodes.includes(id)).length;
            if (endpointsAttached >= 2) {
                hasStars = true;
                starCenters++;
            }
        });

        // Determine Final Topology
        if (coreTopo === 'Point' && hasStars) {
            type = 'Star';
        } else if (coreTopo === 'Bus') {
            type = hasStars ? 'Star-Bus' : 'Bus';
        } else if (coreTopo === 'Ring') {
            type = hasStars ? 'Star-Ring' : 'Ring';
        } else if (coreTopo === 'Mesh') {
            type = hasStars ? 'Star-Mesh' : 'Mesh';
        }

        // Simplistic Direct PC-PC overrides if needed (but handled by isError)
    }

    state.detectedTopologyName = type;
    topologyDetectSpan.innerText = type;

    if (type !== 'None' && topologyData[type]) {
        btnShowTopoInfo.classList.remove('hidden');
    } else {
        btnShowTopoInfo.classList.add('hidden');
    }

    // Task verification
    if (state.currentTask) {
        // e.g. "Star-Bus"
        if (type === state.currentTask || (state.currentTask === 'Bus' && type.includes('Bus')) || (state.currentTask === 'Mesh' && type.includes('Mesh'))) {
            btnVerifyTask.classList.remove('hidden');
        } else {
            btnVerifyTask.classList.add('hidden');
        }
    }
}

// Modals
btnShowTopoInfo.addEventListener('click', () => {
    const topo = topologyData[state.detectedTopologyName];
    if(!topo) return;
    
    document.getElementById('topo-name').innerText = state.detectedTopologyName + ' Topology';
    document.getElementById('topo-desc').innerText = topo.desc;
    document.getElementById('topo-how').innerText = topo.how;
    
    const advList = document.getElementById('topo-adv');
    advList.innerHTML = '';
    topo.adv.forEach(a => {
        const li = document.createElement('li');
        li.innerText = a;
        advList.appendChild(li);
    });
    
    document.getElementById('topology-modal').classList.remove('hidden');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.add('hidden');
    });
});

// Simulation & Learning Output
btnSimulate.addEventListener('click', () => {
    state.isSimulating = !state.isSimulating;
    
    if (state.isSimulating) {
        btnSimulate.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Simulation';
        btnSimulate.style.background = 'var(--error)';
        updateConnections(); // Attach dots
        
        // Auto show learning output after 4 seconds of simulation
        clearTimeout(state.simTimeout);
        state.simTimeout = setTimeout(() => {
            if(state.isSimulating) {
                btnSimulate.click(); // Stop sim
                showLearningOutput();
            }
        }, 4000);

    } else {
        btnSimulate.innerHTML = '<i class="fa-solid fa-play"></i> Start Simulation';
        btnSimulate.style.background = 'var(--accent)';
        clearTimeout(state.simTimeout);
        updateConnections(); // Remove dots
    }
});

function showLearningOutput() {
    const list = document.getElementById('sim-flow-desc');
    list.innerHTML = '';
    const roles = document.getElementById('sim-roles');
    roles.innerHTML = '';
    const feedbackBox = document.getElementById('sim-feedback-box');
    const feedbackText = document.getElementById('sim-feedback-text');

    if (state.connections.length === 0) {
        list.innerHTML = '<li>No connections to simulate! Add some devices and connect them first.</li>';
        document.getElementById('learning-modal').classList.remove('hidden');
        return;
    }

    // Generate explanations based on devices present
    let roleText = [];
    const presentTypes = [...new Set(state.devices.map(d => d.type))];
    if (presentTypes.includes('pc')) roleText.push(`<b>PC:</b> Acts as the data source or destination (Client).`);
    if (presentTypes.includes('server')) roleText.push(`<b>Server:</b> Processes requests and hosts data/resources.`);
    if (presentTypes.includes('switch')) roleText.push(`<b>Switch:</b> Intelligently forwards data only to the specific device intended.`);
    if (presentTypes.includes('hub')) roleText.push(`<b>Hub:</b> Broadcasts received data to all connected devices blindly (can cause noise).`);
    if (presentTypes.includes('router')) roleText.push(`<b>Router:</b> Interprets IP addresses to route data between different networks.`);
    
    roles.innerHTML = roleText.join('<br><br>');

    // Step-by-step
    const steps = [
        "1. Application initiates a data transfer request (e.g., retrieving a webpage).",
        "2. Data is broken down into small, manageable 'packets'.",
        "3. Packets traverse through Core forwarders.",
        "4. Devices examine packet headers to determine the correct path.",
        "5. Destination endpoint receives and reassembles the packets."
    ];
    
    steps.forEach(s => {
        const li = document.createElement('li');
        li.innerText = s;
        list.appendChild(li);
    });

    // Valid check
    const errors = state.connections.filter(c => c.isError).length;
    if (errors > 0) {
        feedbackBox.className = 'info-section error';
        document.getElementById('sim-feedback-title').innerText = 'Warning: Network Errors Detected';
        feedbackText.innerText = `During simulation, collisions or bottlenecks occurred due to ${errors} inefficient direct connection(s). Please review your topology using switches/routers.`;
    } else {
        feedbackBox.className = 'info-section';
        document.getElementById('sim-feedback-title').innerText = 'Excellent Network Design';
        feedbackText.innerText = `Your ${state.detectedTopologyName} network is fully functional. Packets routed successfully without major collisions.`;
    }

    document.getElementById('learning-modal').classList.remove('hidden');
}


// Controls
const btnSavePki = document.getElementById('btn-save-pki');

if (btnSavePki) {
    btnSavePki.addEventListener('click', () => {
        if (state.devices.length === 0) {
            showToast('Canvas is empty! Nothing to save.', 'error');
            return;
        }
        
        // Structure the PKI (Packet Tracer Info) metadata
        const pkiData = {
            version: "1.0",
            savedAt: new Date().toISOString(),
            topologyName: state.detectedTopologyName,
            deviceState: state.devices,
            connectionLines: state.connections
        };
        
        const dataStr = JSON.stringify(pkiData, null, 4);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `network_topology_${Date.now()}.pki`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        
        showToast('Downloaded .PKI file successfully!', 'success');
    });
}

btnClear.addEventListener('click', () => {
    state.devices = [];
    state.connections = [];
    state.selectedDeviceId = null;
    canvas.querySelectorAll('.canvas-device').forEach(el => el.remove());
    updateConnections();
    detectTopology();
    showToast('Canvas cleared.', 'success');
});

document.getElementById('btn-help').addEventListener('click', () => {
    showExplanation('How to play', 'Drag devices from the left sidebar onto the canvas. Click one device, then click another to draw a connection cable between them. Ensure appropriate core devices are used!');
});

// Toasts
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-triangle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Tasks
document.querySelectorAll('.task-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const taskName = e.target.dataset.task; 
        state.currentTask = taskName;
        currentTaskLabel.innerText = `Build: ${taskName}`;
        btnVerifyTask.classList.add('hidden');
        showToast(`Task Activated: Build a ${taskName} Topology.`, 'info');
        detectTopology();
    });
});

btnVerifyTask.addEventListener('click', () => {
    celebrationMsg.innerText = `You successfully built the ${state.detectedTopologyName} Topology! The AI verified your correct component combinations.`;
    celebrationScreen.classList.remove('hidden');
});

document.getElementById('btn-continue').addEventListener('click', () => {
    celebrationScreen.classList.add('hidden');
    state.currentTask = null;
    currentTaskLabel.innerText = 'Freestyle Exploration';
    btnVerifyTask.classList.add('hidden');
    // We don't clear canvas so they can admire it, until they click clear.
});

// Chatbot Logic
const aiChatbot = document.getElementById('ai-chatbot');
const btnOpenChat = document.getElementById('btn-open-chat');
const btnCloseChat = document.getElementById('close-chat');
const chatbotMessages = document.getElementById('chatbot-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

btnOpenChat.addEventListener('click', () => {
    aiChatbot.classList.remove('hidden');
    btnOpenChat.classList.add('hidden');
});

btnCloseChat.addEventListener('click', () => {
    aiChatbot.classList.add('hidden');
    btnOpenChat.classList.remove('hidden');
});

function addChatMessage(text, isUser = false) {
    const div = document.createElement('div');
    div.className = isUser ? 'user-msg' : 'bot-msg';
    div.innerText = text;
    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage(text, true);
    chatInput.value = '';

    const lower = text.toLowerCase();
    let reply = "I'm still learning! Try asking me about topologies (Star, Bus, Mesh), devices (Router, Switch, Hub), or concepts like IP, MAC, DNS, DHCP, VPN, LAN, WAN, or the OSI model.";
    
    setTimeout(() => {
        // Topologies
        if (lower.includes('star')) reply = topologyData.Star.desc;
        else if (lower.includes('bus')) reply = topologyData.Bus.desc;
        else if (lower.includes('ring')) reply = topologyData.Ring.desc;
        else if (lower.includes('mesh')) reply = topologyData.Mesh.desc;
        else if (lower.includes('hybrid')) reply = "A hybrid topology uniquely combines two or more different topologies (like Star-Bus or Star-Mesh) to inherit their combined benefits and scale better.";
        
        // Devices
        else if (lower.includes('switch')) reply = "A Switch acts as a smart controller connecting devices within a LAN, using MAC addresses to forward data exactly where it needs to go.";
        else if (lower.includes('router')) reply = "A Router connects multiple networks together (like your house to the Internet) and routes data using IP addresses.";
        else if (lower.includes('hub')) reply = "A Hub connects devices but simply broadcasts any signal it receives to all connected ports blindly, which causes traffic collisions.";
        else if (lower.includes('modem')) reply = "A Modem modulates and demodulates analog signals to digital signals, acting as your pure gateway to your Internet Service Provider.";
        else if (lower.includes('firewall')) reply = "A Firewall establishes a barrier between your secure internal network and the untrusted outside internet, filtering traffic based on rules.";
        else if (lower.includes('bridge')) reply = "A Bridge connects two separate LAN segments together, helping to reduce collisions by isolating traffic.";
        else if (lower.includes('server')) reply = "A Server is a powerful computer dedicated to managing network resources and providing data, services, or programs to other computers (clients).";
        else if (lower.includes('ap') || lower.includes('access point') || lower.includes('wifi') || lower.includes('wi-fi')) reply = "An Access Point (AP) creates a wireless local area network (WLAN), usually in a home or office building, allowing Wi-Fi devices to connect to a wired network.";
        
        // Core Network Concepts
        else if (lower.includes('ip address') || (lower.includes('ip') && lower.includes('what'))) reply = "An IP (Internet Protocol) address is a unique string of numbers separated by periods that identifies each computer using the Internet Protocol to communicate over a network.";
        else if (lower.includes('mac address') || (lower.includes('mac') && lower.includes('what'))) reply = "A MAC (Media Access Control) address is a permanent physical identifier baked into a network card to uniquely identify it on a local segment.";
        else if (lower.includes('dns')) reply = "DNS (Domain Name System) is the phonebook of the Internet. It translates human-readable domain names (like google.com) into IP addresses that computers use to identify each other.";
        else if (lower.includes('dhcp')) reply = "DHCP (Dynamic Host Configuration Protocol) automatically assigns IP addresses and other dynamic network parameters to devices so they can communicate smoothly.";
        else if (lower.includes('vpn')) reply = "A VPN (Virtual Private Network) establishes a protected, encrypted network connection when using public networks. It hides your IP address and secures your data.";
        else if (lower.includes('lan')) reply = "LAN stands for Local Area Network. It's a network confined to a small geographic area, naturally like a single room, building, or group of buildings.";
        else if (lower.includes('wan')) reply = "WAN stands for Wide Area Network. It connects smaller, localized networks over massive distances. The Internet is the largest WAN in the world.";
        else if (lower.includes('osi')) reply = "The OSI (Open Systems Interconnection) model is a conceptual model that standardizes the communication functions of a telecommunication system into 7 universal layers (Physical, Data Link, Network, Transport, Session, Presentation, Application).";
        else if (lower.includes('tcp') || lower.includes('udp')) reply = "TCP provides reliable, ordered transmission of data (checking for errors). UDP sends data quickly without checking if it arrived (great for live video or gaming).";
        else if (lower.includes('ping')) reply = "Ping is a diagnostic utility used to test the reachability of a host on an Internet Protocol (IP) network specifically measuring the round-trip time for messages.";
        else if (lower.includes('packet')) reply = "A packet is a small, formatted unit of data carried by a packet-switched network. Large files are broken down into thousands of packets before transmission.";
        else if (lower.includes('bandwidth') || lower.includes('speed')) reply = "Bandwidth is the maximum rate of data transfer across a given path. It's the 'width of the pipe', while latency is how fast data effectively travels through that pipe.";
        
        // Greetings
        else if (lower === 'hi' || lower === 'hello' || lower.includes('hey')) reply = "Hello there! Ask me anything about networking or building topologies.";
        else if (lower.includes('help')) reply = "Sure, I'm your dedicated NetViz AI Helper! You can ask me to define any device (like a router), explain concepts (like IP or DNS), or discuss topologies.";
        
        addChatMessage(reply, false);
    }, 500);
}

btnSendChat.addEventListener('click', handleChatSubmit);
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleChatSubmit(); });

// Instructor Mascot Roaming
const mascot = document.getElementById('instructor-mascot');
let mascotX = canvas.clientWidth - 100;
let mascotY = canvas.clientHeight - 100;

function moveMascot() {
    if (!canvas) return;
    // Set explicit position initially
    mascot.style.right = 'auto';
    mascot.style.bottom = 'auto';
    
    // Pick random target in canvas
    const targetX = Math.random() * (canvas.clientWidth - 100) + 20;
    const targetY = Math.random() * (canvas.clientHeight - 100) + 20;
    
    mascot.style.left = `${targetX}px`;
    mascot.style.top = `${targetY}px`;
    
    // Random wait time before next move
    setTimeout(moveMascot, Math.random() * 4000 + 3000);
}

// Start roaming slightly after load
setTimeout(moveMascot, 2000);

// --- THEME TOGGLE LOGIC ---
const themeToggleBtn = document.getElementById('theme-toggle');
let currentTheme = localStorage.getItem('netviz_theme') || 'light';
document.body.setAttribute('data-theme', currentTheme);
updateThemeIcon();

themeToggleBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('netviz_theme', currentTheme);
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
});

function updateThemeIcon() {
    if (currentTheme === 'dark') {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun" style="color:#fcd34d;"></i>';
    } else {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

// Authentication Logic
const authModal = document.getElementById('auth-modal');
const appContainer = document.getElementById('app-container');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authErrorMsg = document.getElementById('auth-error-msg');
const welcomeUserText = document.getElementById('welcome-user-text');
const btnLogout = document.getElementById('btn-logout');

// Check Login state on load
const currentUser = localStorage.getItem('netviz_active_user');
if (currentUser) {
    showApp(currentUser);
} else {
    authModal.style.display = 'flex';
    appContainer.style.display = 'none';
}

// Tab Switching
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabSignup.classList.remove('active');
    loginForm.classList.remove('hidden'); signupForm.classList.add('hidden');
    authErrorMsg.innerText = '';
});

tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active'); tabLogin.classList.remove('active');
    signupForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    authErrorMsg.innerText = '';
});

// Forms Submission
signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('signup-user').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-pass').value.trim();
    
    if(!user || !pass) return;
    
    let users = JSON.parse(localStorage.getItem('netviz_users') || '{}');
    if (users[user]) {
        authErrorMsg.style.color = 'var(--error)';
        authErrorMsg.innerText = "Username already exists.";
        return;
    }
    
    // Save user to storage
    users[user] = { password: pass, email: email };
    localStorage.setItem('netviz_users', JSON.stringify(users));
    
    // Switch to Login Tab
    tabLogin.click();
    
    // Show success message and clear form
    signupForm.reset();
    authErrorMsg.style.color = 'var(--accent)'; // green success color
    authErrorMsg.innerText = "Account created successfully! Please log in.";
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    authErrorMsg.style.color = 'var(--error)'; // Ensure error styling is default
    
    let users = JSON.parse(localStorage.getItem('netviz_users') || '{}');
    if (users[user] && users[user].password === pass) {
        localStorage.setItem('netviz_active_user', user);
        showApp(user);
    } else {
        authErrorMsg.innerText = "Invalid credentials. Please try again.";
    }
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem('netviz_active_user');
    authModal.style.display = 'flex';
    appContainer.style.display = 'none';
    
    // Clear forms
    loginForm.reset();
    signupForm.reset();
    btnClear.click(); // resets previous state
});

function showApp(username) {
    authModal.style.display = 'none';
    appContainer.style.display = 'flex';
    welcomeUserText.innerText = `Welcome, ${username}`;
}

// Download Canvas Feature
document.getElementById('btn-download').addEventListener('click', () => {
    const originalText = document.getElementById('btn-download').innerHTML;
    document.getElementById('btn-download').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    // Briefly hide UI overlays that shouldnt be in the download
    const oldMascotDisplay = mascot.style.display;
    mascot.style.display = 'none';
    document.querySelector('.mode-info').style.display = 'none';
    
    html2canvas(document.getElementById('canvas'), {
        backgroundColor: '#f8fafc',
        scale: 2, // High res export
        useCORS: true
    }).then(canvasOutput => {
        // Restore UI
        mascot.style.display = oldMascotDisplay;
        document.querySelector('.mode-info').style.display = 'flex';
        
        // Trigger download
        const link = document.createElement('a');
        link.download = `NetViz_Topology_${state.detectedTopologyName}.png`;
        link.href = canvasOutput.toDataURL("image/png");
        link.click();
        
        showToast('Topology exported successfully!', 'success');
        document.getElementById('btn-download').innerHTML = originalText;
    }).catch(err => {
        console.error("Download Error", err);
        showToast("Error processing download.", "error");
        document.getElementById('btn-download').innerHTML = originalText;
        
        // Restore UI on error
        mascot.style.display = oldMascotDisplay;
        document.querySelector('.mode-info').style.display = 'flex';
    });
});
