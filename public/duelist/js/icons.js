// ============================================================
//  Icons der Fähigkeiten – als SVG, damit sie in jeder Größe
//  scharf bleiben (HUD, Touch-Knopf, Auswahl, Lektionen)
// ============================================================

const ABILITY_ICONS = {
    "Shield": `<path class="f" d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M12 7v10"/>`,
    "Damage Stack": `<path d="M6 20l6-5 6 5M6 14.5l6-5 6 5M6 9l6-5 6 5"/>`,
    "Invisibility": `<path class="f" d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20L20 4"/>`,
    "Heal": `<path class="f" d="M12 20.5S4.5 16 4.5 10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 6-7.5 10.5-7.5 10.5z"/><path d="M12 10.5v5M9.5 13h5"/>`,
    "Frenzy": `<path d="M5 19c3.5-3.5 5.5-8 6-14M10 20.5c3.5-3.5 5.5-8 6-14M15.5 21c2.4-2.6 3.8-5.8 4.2-10"/>`,
    "Blink": `<path class="f" d="M13.5 2.5L5 13.5h6l-1.5 8 9-11.5h-6z"/>`,
    "Segen": `<path class="f" d="M12 3.5l1.9 6.6 6.6 1.9-6.6 1.9-1.9 6.6-1.9-6.6-6.6-1.9 6.6-1.9z"/><path d="M19 3.5v3M17.5 5h3"/>`,
    "Sturmritt": `<path d="M3 12h13M12 6.5l5.5 5.5-5.5 5.5M3 7h5M3 17h5"/>`,
    "Glibberpfütze": `<path class="f" d="M12 3s5.5 6.4 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.4 12 3 12 3z"/><path d="M4 21h16"/>`,
    "Soul Quake": `<path d="M2.5 13l3-4 3 8 3.5-11 3.5 11 3-8 3 4"/>`
}

// Gibt das Icon der Fähigkeit eines Champions als SVG-Markup zurück
function abilityIcon(champ, cls = "ab-icon") {
    const body = ABILITY_ICONS[champ.ability.name] || ABILITY_ICONS.Shield
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
}
