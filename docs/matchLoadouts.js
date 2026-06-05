const WEAPON_COLUMNS = [
    {
        className: "weapon-column-sidearms",
        groups: [{ title: "Sidearms", slug: "sidearms", weapons: ["Classic", "Shorty", "Frenzy", "Ghost", "Bandit", "Sheriff"] }],
    },
    {
        className: "weapon-column-smgs",
        groups: [
            { title: "SMGs", slug: "smgs", weapons: ["Stinger", "Spectre"] },
            { title: "Shotguns", slug: "shotguns", weapons: ["Bucky", "Judge"] },
        ],
    },
    {
        className: "weapon-column-rifles",
        groups: [
            { title: "Rifles", slug: "rifles", weapons: ["Bulldog", "Guardian", "Phantom", "Vandal"] },
            { title: "Melee", slug: "melee", weapons: ["Melee"] },
        ],
    },
    {
        className: "weapon-column-heavy",
        groups: [
            { title: "Sniper Rifles", slug: "sniper-rifles", weapons: ["Marshal", "Outlaw", "Operator"] },
            { title: "Machine Guns", slug: "machine-guns", weapons: ["Ares", "Odin"] },
        ],
    },
];

const PREVIEW_WEAPONS = ["Vandal", "Phantom", "Sheriff"];
const CACHE_KEY = "vry.matchLoadouts.cache";
const DEFAULT_PORT = "1100";

const state = {
    socket: null,
    payload: null,
    players: [],
    selectedSubject: null,
};

const els = {
    blueGrid: document.getElementById("blueGrid"),
    redGrid: document.getElementById("redGrid"),
    detailsPanel: document.getElementById("detailsPanel"),
    emptyState: document.getElementById("emptyState"),
    selectedAgent: document.getElementById("selectedAgent"),
    selectedTeam: document.getElementById("selectedTeam"),
    selectedName: document.getElementById("selectedName"),
    selectedCardTitle: document.getElementById("selectedCardTitle"),
    selectedModalName: document.getElementById("selectedModalName"),
    selectedLevel: document.getElementById("selectedLevel"),
    playerCardPreview: document.getElementById("playerCardPreview"),
    expressionGrid: document.getElementById("expressionGrid"),
    weaponGroups: document.getElementById("weaponGroups"),
    closeDetailsButton: document.getElementById("closeDetailsButton"),
};

function init() {
    els.closeDetailsButton.addEventListener("click", () => {
        state.selectedSubject = null;
        render();
    });
    els.detailsPanel.addEventListener("click", (event) => {
        if (event.target === els.detailsPanel) {
            state.selectedSubject = null;
            render();
        }
    });
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.selectedSubject) {
            state.selectedSubject = null;
            render();
        }
    });

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            setPayload(JSON.parse(cached), false);
        } catch (error) {
            localStorage.removeItem(CACHE_KEY);
        }
    }

    connect();
}

function connect() {
    const params = new URLSearchParams(window.location.search);
    const port = sanitizePort(params.get("port") || DEFAULT_PORT);

    if (state.socket) {
        state.socket.close();
    }

    setStatus("Connecting", "pending");
    const host = window.location.hostname || "localhost";
    const socket = new WebSocket(`ws://${host}:${port}/`);
    state.socket = socket;

    socket.addEventListener("open", () => setStatus("Connected", "live"));
    socket.addEventListener("close", () => setStatus("Disconnected", "error"));
    socket.addEventListener("error", () => setStatus("Connection failed", "error"));
    socket.addEventListener("message", (event) => {
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (payload.type && payload.type !== "matchLoadout") {
            return;
        }

        if (payload.Players) {
            setPayload(payload, true);
        }
    });
}

function sanitizePort(value) {
    const digits = String(value || "").replace(/\D/g, "");
    const parsed = Number(digits);
    if (!parsed || parsed < 1 || parsed > 65535) {
        return "1100";
    }
    return String(parsed);
}

function setStatus() {
    // Connection state is intentionally silent in the loadout UI.
}

function setPayload(payload, shouldCache) {
    state.payload = payload;
    state.players = normalizePlayers(payload);

    if (!state.players.some((player) => player.Subject === state.selectedSubject)) {
        state.selectedSubject = null;
    }

    if (shouldCache) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    }

    render();
}

function normalizePlayers(payload) {
    const rawPlayers = payload && payload.Players ? payload.Players : {};
    const entries = Array.isArray(rawPlayers)
        ? rawPlayers.map((player, index) => [player.Subject || String(index), player])
        : Object.entries(rawPlayers);

    return entries
        .map(([subject, player]) => ({ ...player, Subject: subject }))
        .filter((player) => player.Name || player.Agent || player.Weapons)
        .sort((a, b) => teamRank(a.Team) - teamRank(b.Team) || getName(a).localeCompare(getName(b)));
}

function teamRank(team) {
    if (team === "Blue") {
        return 0;
    }
    if (team === "Red") {
        return 1;
    }
    return 2;
}

function render() {
    renderPlayers();
    renderDetails();
}

function renderPlayers() {
    els.blueGrid.replaceChildren();
    els.redGrid.replaceChildren();

    state.players.forEach((player) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `player-button ${teamClass(player.Team)}`;
        button.classList.toggle("is-selected", player.Subject === state.selectedSubject);
        button.addEventListener("click", () => {
            state.selectedSubject = player.Subject;
            render();
        });

        const avatar = buildAgentAvatar(player.Agent, player.AgentArtworkName);

        const identity = document.createElement("div");
        identity.className = "player-main";

        const name = document.createElement("span");
        name.className = "player-name";
        name.textContent = getName(player);
        name.title = name.textContent;

        const agent = document.createElement("span");
        agent.className = "agent-name";
        agent.textContent = agentName(player) || "Unknown Agent";
        agent.title = agent.textContent;

        const meta = document.createElement("span");
        meta.className = "player-meta";
        meta.textContent = player.Team || "Unknown Team";

        const action = document.createElement("span");
        action.className = "player-action";
        action.textContent = "View loadout";

        identity.append(name, agent, meta, action);
        button.append(avatar, identity, buildPreviewRow(player));

        const grid = player.Team === "Red" ? els.redGrid : els.blueGrid;
        grid.append(button);
    });
}

function buildPreviewRow(player) {
    const row = document.createElement("div");
    row.className = "preview-row";

    PREVIEW_WEAPONS.forEach((weaponName) => {
        const weapon = getWeapon(player, weaponName);
        const slot = document.createElement("span");
        slot.className = "preview-slot";

        if (weapon && weapon.skinDisplayIcon) {
            const img = document.createElement("img");
            img.src = weapon.skinDisplayIcon;
            img.alt = weapon.skinDisplayName || weapon.weapon || "Weapon";
            slot.append(img);
        }

        const copy = document.createElement("span");
        copy.className = "preview-copy";

        const label = document.createElement("span");
        label.className = "preview-label";
        label.textContent = weaponName;

        const name = document.createElement("span");
        name.className = "preview-name";
        name.textContent = weapon ? weapon.skinDisplayName || weapon.weapon || weaponName : "Not found";
        name.title = name.textContent;

        copy.append(label, name);
        slot.append(copy);
        row.append(slot);
    });

    return row;
}

function renderDetails() {
    const selected = state.players.find((player) => player.Subject === state.selectedSubject);
    const hasSelection = Boolean(selected);
    els.detailsPanel.hidden = !hasSelection;
    els.emptyState.hidden = hasSelection || state.players.length > 0;

    if (!selected) {
        return;
    }

    els.selectedAgent.src = selected.Agent || "";
    els.selectedAgent.hidden = !selected.Agent;
    els.selectedAgent.alt = selected.AgentArtworkName || "";
    els.selectedName.textContent = getName(selected);
    els.selectedCardTitle.textContent = selected.Title || "";
    els.selectedCardTitle.hidden = !selected.Title;
    els.selectedModalName.textContent = agentName(selected) || "Agent";
    els.selectedLevel.textContent = selected.Level ? `Level ${selected.Level}` : "Level";
    els.selectedTeam.textContent = selected.Team || "Unknown";
    els.selectedTeam.className = `team-pill ${teamClass(selected.Team)}`;

    if (selected.PlayerCard) {
        els.playerCardPreview.style.backgroundImage = `url("${selected.PlayerCard}")`;
    } else {
        els.playerCardPreview.style.backgroundImage = "";
    }

    renderExpressions(selected);
    renderWeapons(selected);
}

function renderExpressions(player) {
    els.expressionGrid.replaceChildren();
    const expressions = getExpressions(player);
    const slots = expressions.slice(0, 4);

    while (slots.length < 4) {
        slots.push(null);
    }

    slots.forEach((expression, index) => {
        const tile = document.createElement("div");
        tile.className = `expression-tile expression-slot-${index}`;
        tile.title = expression ? expression.displayName || "Expression" : `Empty slot ${index + 1}`;
        tile.setAttribute("aria-label", tile.title);
        if (expression && expression.type === "flex") {
            tile.classList.add("is-flex");
        }

        const art = document.createElement("div");
        art.className = "expression-art";
        if (expression && (expression.fullTransparentIcon || expression.displayIcon)) {
            const img = document.createElement("img");
            img.src = expression.fullTransparentIcon || expression.displayIcon;
            img.alt = expression.displayName || "Expression";
            art.append(img);
        }

        const copy = document.createElement("div");
        copy.className = "expression-copy";

        const name = document.createElement("strong");
        name.textContent = expression ? expression.displayName || "Unknown Expression" : `Slot ${index + 1}`;

        const type = document.createElement("span");
        type.className = "expression-type";
        type.textContent = expression ? expression.type || "expression" : "empty";

        copy.append(name, type);
        tile.append(art, copy);
        els.expressionGrid.append(tile);
    });
}

function renderWeapons(player) {
    els.weaponGroups.replaceChildren();

    WEAPON_COLUMNS.forEach((column) => {
        const columnNode = document.createElement("div");
        columnNode.className = `weapon-column ${column.className}`;

        column.groups.forEach((group) => {
            const section = document.createElement("section");
            section.className = `weapon-group weapon-group-${group.slug}`;

            const heading = document.createElement("h3");
            heading.textContent = group.title;

            const grid = document.createElement("div");
            grid.className = "weapon-grid";

            group.weapons.forEach((weaponName) => {
                grid.append(buildWeaponTile(player, weaponName));
            });

            section.append(heading, grid);
            columnNode.append(section);
        });

        els.weaponGroups.append(columnNode);
    });
}

function buildWeaponTile(player, weaponName) {
    const weapon = getWeapon(player, weaponName);
    const tile = document.createElement("div");
    tile.className = "weapon-tile";
    tile.classList.toggle("is-empty", !weapon);
    tile.title = weapon
        ? `${weaponName}: ${weapon.skinDisplayName || weapon.weapon || "Unknown skin"}`
        : `${weaponName}: not found`;

    const art = document.createElement("div");
    art.className = "weapon-art";
    if (weapon && (weapon.skinDisplayIcon || weapon.weaponDisplayIcon)) {
        const img = document.createElement("img");
        img.src = weapon.skinDisplayIcon || weapon.weaponDisplayIcon;
        img.alt = weapon.skinDisplayName || weapon.weapon || weaponName;
        art.append(img);
    }

    const copy = document.createElement("div");
    copy.className = "weapon-copy";

    const label = document.createElement("span");
    label.className = "weapon-name";
    label.textContent = weaponName;

    const name = document.createElement("strong");
    name.textContent = weapon ? weapon.skinDisplayName || weapon.weapon || weaponName : "";
    name.title = name.textContent;

    copy.append(label, name);
    tile.append(art, copy);

    if (weapon && weapon.buddy_displayIcon) {
        tile.classList.add("has-buddy");
        const buddy = document.createElement("img");
        buddy.className = "buddy";
        buddy.src = weapon.buddy_displayIcon;
        buddy.alt = "Buddy";
        tile.append(buddy);
    }

    return tile;
}

function getWeapon(player, weaponName) {
    return Object.values(player.Weapons || {}).find((weapon) => weapon.weapon === weaponName);
}

function getExpressions(player) {
    if (Array.isArray(player.Expressions) && player.Expressions.length) {
        return [...player.Expressions].sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
    }

    return Object.entries(player.Sprays || {})
        .map(([index, expression]) => ({ index: Number(index), type: expression.type || "spray", ...expression }))
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
}

function getName(player) {
    return player.Name || agentName(player) || player.Subject || "Unknown";
}

function agentName(player) {
    return String(player.AgentArtworkName || "").replace(/Artwork$/, "");
}

function buildAgentAvatar(src, alt) {
    if (!src) return makeAvatarPlaceholder();
    const img = document.createElement("img");
    img.className = "agent-avatar";
    img.alt = alt || "";
    img.src = src;
    img.addEventListener("error", () => img.replaceWith(makeAvatarPlaceholder()));
    return img;
}

function makeAvatarPlaceholder() {
    const el = document.createElement("div");
    el.className = "agent-avatar agent-avatar-placeholder";
    el.textContent = "?";
    el.setAttribute("aria-label", "Unknown agent");
    return el;
}

function teamClass(team) {
    if (team === "Blue") {
        return "is-blue";
    }
    if (team === "Red") {
        return "is-red";
    }
    return "";
}

init();
