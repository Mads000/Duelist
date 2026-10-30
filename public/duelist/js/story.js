// ============================================================
//  Story-Modus – pro Champion drei Rivalen, dann Gravelord,
//  mit Text vor jedem Kapitel und einem eigenen Ende
// ============================================================

const STORY = {
    vanguard: {
        chapters: [
            { opp: "warbrute", map: "sky", diff: "normal", title: "Der erste Riss", text: "Warbrute war einst dein stärkster Krieger. Jetzt stürmt er mit Bomben in der Hand auf dich zu. Halte stand – vielleicht erreichst du ihn noch." },
            { opp: "boneguard", map: "classic", diff: "normal", title: "Schatten der Vergangenheit", text: "Boneguard war tot – und doch steht er vor dir. Wer hat ihn zurückgeholt?" },
            { opp: "arcanis", map: "frost", diff: "hard", title: "Das Schweigen", text: "Arcanis sah den Verrat kommen und schwieg. Du willst Antworten. Er will nur vergessen." }
        ],
        boss: "Alle Spuren führen zu Gravelord. Er hat die Gruppe zerrissen. Heute endet es.",
        ending: "Gravelord fällt. Vanguard reicht seinen alten Freunden die Hand – nicht alle nehmen sie. Doch der Schild steht wieder, und mit ihm die Hoffnung."
    },
    warbrute: {
        chapters: [
            { opp: "vanguard", map: "sky", diff: "normal", title: "Der alte Anführer", text: "Vanguard predigt Ehre. Du hast gelernt, dass nur Stärke zählt. Zeig ihm, wer jetzt das Sagen hat." },
            { opp: "rageclaw", map: "volcano", diff: "normal", title: "Bestie gegen Bestie", text: "Rageclaw stellt sich dir in der Glut entgegen. Zwei Wilde – nur einer verlässt die Schmiede." },
            { opp: "nightfang", map: "frost", diff: "hard", title: "Jagdzeit", text: "Nightfang jagt dich über das Eis. Doch wer jagt hier eigentlich wen?" }
        ],
        boss: "Gravelord flüstert: „Diene mir, und alle Macht ist dein.“ Du hast lange genug gedient.",
        ending: "Gravelords Krone zerbricht unter deiner Axt. Zum ersten Mal seit Jahren legst du die Bomben nieder. Vielleicht war Stärke nie das, was dir fehlte."
    },
    boneguard: {
        chapters: [
            { opp: "nightfang", map: "classic", diff: "normal", title: "Erwacht", text: "Du erinnerst dich nur an Kälte. Nightfang wittert den Tod an dir und greift an." },
            { opp: "vanguard", map: "sky", diff: "normal", title: "Ein vertrautes Gesicht", text: "Vanguard erkennt dich nicht – oder will es nicht. Erinnere ihn mit dem Speer daran, wer du warst." },
            { opp: "warbrute", map: "volcano", diff: "hard", title: "Der Verräter", text: "Warbrute ließ dich damals fallen. Die Schatten verlangen Rache." }
        ],
        boss: "Gravelord holte dich zurück, um dich zu benutzen. Zeig ihm, dass der Tod dich nicht gehorsam gemacht hat.",
        ending: "Mit Gravelord verlöschen die Ketten, die dich hielten. Boneguard verschwindet in den Schatten – frei, endlich frei."
    },
    rageclaw: {
        chapters: [
            { opp: "arcanis", map: "classic", diff: "normal", title: "Der Fluch", text: "Arcanis behauptet, deinen Fluch heilen zu können. Doch zuerst will die Bestie kämpfen." },
            { opp: "warbrute", map: "volcano", diff: "normal", title: "Rohe Gewalt", text: "Warbrute verspottet die Bestie in dir. Lass sie ein einziges Mal los." },
            { opp: "boneguard", map: "frost", diff: "hard", title: "Der alte Bruder", text: "Boneguard war wie ein Bruder. Jetzt ist er kalt wie das Eis unter euren Füßen." }
        ],
        boss: "Gravelord hat die Bestie in dir geweckt. Nur sein Fall kann sie wieder schlafen legen.",
        ending: "Der Fluch verblasst mit Gravelords letztem Atemzug. Rageclaw bleibt halb Mensch, halb Bestie – aber nun ganz er selbst."
    },
    nightfang: {
        chapters: [
            { opp: "rageclaw", map: "frost", diff: "normal", title: "Revierkampf", text: "Rageclaw streift durch dein Jagdgebiet. Nur einer von euch ist der Alpha." },
            { opp: "arcanis", map: "sky", diff: "normal", title: "Mondzeichen", text: "Arcanis liest in den Sternen, dass du fallen wirst. Beweise ihm das Gegenteil." },
            { opp: "vanguard", map: "classic", diff: "hard", title: "Der Schild", text: "Vanguard stellt sich zwischen dich und deine Beute. Sein Schild hält viel aus – aber nicht alles." }
        ],
        boss: "Gravelord ist die größte Beute von allen. Der Mond steht hoch – die letzte Jagd beginnt.",
        ending: "Die Arena gehört dem Rudel. Nightfang heult in den Mond – nicht aus Hunger, sondern aus Freiheit."
    },
    arcanis: {
        chapters: [
            { opp: "boneguard", map: "classic", diff: "normal", title: "Schuld", text: "Boneguard fiel, weil du geschwiegen hast. Jetzt steht er vor dir, und du kannst nicht mehr wegsehen." },
            { opp: "nightfang", map: "frost", diff: "normal", title: "Sternenjäger", text: "Nightfang will die Sterne verschlingen, die du liest. Halte ihn mit Feuer und Eis zurück." },
            { opp: "warbrute", map: "volcano", diff: "hard", title: "Die Vision", text: "Du hast gesehen, wie Warbrute die Gruppe verraten würde. Diesmal schweigst du nicht." }
        ],
        boss: "Hinter allem stand Gravelord. Das hast selbst du nicht kommen sehen.",
        ending: "Die Sterne leuchten wieder klar. Arcanis spricht endlich aus, was er wusste – und findet die Vergebung, die er suchte."
    },
    seraphina: {
        chapters: [
            { opp: "boneguard", map: "classic", diff: "normal", title: "Die verirrte Seele", text: "Boneguard wandelt zwischen Leben und Tod. Vielleicht kann dein Licht ihn erlösen – aber erst muss er stillhalten." },
            { opp: "gloop", map: "sky", diff: "normal", title: "Ein klebriges Problem", text: "Ein Schleim hat den Tempelbrunnen besetzt und weigert sich zu gehen. Freundlich bitten hat nicht funktioniert." },
            { opp: "rageclaw", map: "frost", diff: "hard", title: "Fluch und Segen", text: "Rageclaws Fluch frisst ihn auf. Dein Segen könnte helfen – wenn er dich nahe genug heranlässt." }
        ],
        boss: "Der Knochenkönig hat das Licht des Tempels gestohlen. Hol es dir zurück.",
        ending: "Das Licht kehrt in den Tempel zurück. Seraphina kniet am Altar – müde, aber lächelnd. Über den Wolken geht die Sonne wieder auf."
    },
    valor: {
        chapters: [
            { opp: "nightfang", map: "frost", diff: "normal", title: "Wettlauf", text: "Nightfang behauptet, schneller zu sein als jedes Pferd. Zeit, ihm das Gegenteil zu zeigen." },
            { opp: "warbrute", map: "volcano", diff: "normal", title: "Die gesperrte Brücke", text: "Warbrute versperrt den letzten Weg zur Arena. Er weicht nicht – also reitest du durch ihn hindurch." },
            { opp: "vanguard", map: "sky", diff: "hard", title: "Ehre gegen Ruhm", text: "Vanguard nennt dich einen Söldner. Du nennst ihn langsam. Nur einer behält recht." }
        ],
        boss: "Gravelord hat die Wolkenbrücken zerstört. Ohne Brücken gibt es keine Boten mehr – und keinen Wind unter den Hufen.",
        ending: "Die Brücken werden neu gebaut, und der erste, der darüber reitet, ist Valor. Diesmal mit einer Botschaft: Die Arena ist frei."
    },
    gloop: {
        chapters: [
            { opp: "arcanis", map: "classic", diff: "normal", title: "Ein Experiment", text: "Arcanis will dich in ein Glas stecken und untersuchen. Du hast andere Pläne." },
            { opp: "seraphina", map: "sky", diff: "normal", title: "Der Brunnen", text: "Seraphina will dich aus dem Tempelbrunnen werfen. Aber der Brunnen ist so gemütlich!" },
            { opp: "warbrute", map: "volcano", diff: "hard", title: "Der Große", text: "Warbrute lacht über den kleinen Schleim. Er lacht nicht mehr lange." }
        ],
        boss: "Der Knochenkönig will alle Wolken austrocknen. Ohne Wolken gibt es keinen Regen – und ohne Regen keinen Gloop.",
        ending: "Gloop hüpft auf Gravelords Thron und macht es sich gemütlich. Niemand traut sich, ihn zu vertreiben. Der neue Herrscher der Arena ist … klebrig."
    },
    gravelord: {
        chapters: [
            { opp: "vanguard", map: "sky", diff: "hard", title: "Der Anführer", text: "Vanguard hielt die Gruppe zusammen. Brich zuerst ihn – dann zerfällt der Rest." },
            { opp: "arcanis", map: "frost", diff: "hard", title: "Der Seher", text: "Arcanis kennt deine Pläne. Er darf sie niemandem verraten." },
            { opp: "boneguard", map: "volcano", diff: "nightmare", title: "Der Widerspenstige", text: "Du hast Boneguard zurückgeholt. Jetzt wendet er sich gegen dich." }
        ],
        boss: null,
        ending: "Niemand stellt sich dem Knochenkönig mehr entgegen. Die Arena über den Wolken gehört dir – doch sie ist leer und still."
    }
}
