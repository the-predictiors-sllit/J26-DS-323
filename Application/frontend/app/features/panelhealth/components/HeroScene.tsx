/**
 * HeroScene.tsx - the illustration at the top of the panel health page: a person photographs the solar panels on a house
 * roof and sees a health score. It is decorative, drawn in SVG (no image files), and the score card in it is only an
 * example. The motion (a light sweeping over the panels, a floating card, a slow sun) is CSS in SCENE_CSS; it stops
 * when `paused` is true and for people who prefer reduced motion. Dark mode changes the sky through the `.dark` class.
 */
type Props = { paused: boolean }

const SCENE_CSS = `
.ph-scene .ph-scan{animation:ph-scan 5.5s ease-in-out infinite}
@keyframes ph-scan{0%{transform:translateX(0);opacity:0}10%{opacity:1}75%{opacity:1}100%{transform:translateX(258px);opacity:0}}
.ph-scene .ph-float{animation:ph-float 6s ease-in-out infinite}
@keyframes ph-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.ph-scene .ph-pulse{animation:ph-pulse 2.6s ease-in-out infinite}
@keyframes ph-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.ph-scene .ph-heat{animation:ph-heat 5.5s ease-in-out infinite}
@keyframes ph-heat{0%,35%{opacity:0}60%{opacity:.85}100%{opacity:0}}
.ph-scene .ph-dash{stroke-dasharray:4 7;animation:ph-dash 1.4s linear infinite}
@keyframes ph-dash{to{stroke-dashoffset:-22}}
.ph-scene .ph-cloud{animation:ph-drift 16s ease-in-out infinite alternate}
@keyframes ph-drift{from{transform:translateX(-8px)}to{transform:translateX(10px)}}
.ph-scene .ph-spin{transform-origin:548px 74px;animation:ph-rot 50s linear infinite}
@keyframes ph-rot{to{transform:rotate(360deg)}}
.dark .ph-scene .ph-sky-a{stop-color:#0c1f3d}
.dark .ph-scene .ph-sky-b{stop-color:#2a1a0a}
.ph-scene[data-paused="true"] *{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){.ph-scene *{animation:none!important}}
`

export default function HeroScene({ paused }: Props) {
  return (
    <>
      <style>{SCENE_CSS}</style>
      <svg
        viewBox="0 0 640 450"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Illustration: a person photographs the solar panels on a house roof and sees an example health score of 84 out of 100"
        className="ph-scene block h-auto w-full"
        data-paused={paused ? "true" : "false"}
      >
        <defs>
          <linearGradient id="phSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe3ff" className="ph-sky-a" />
            <stop offset="1" stopColor="#fff4e0" className="ph-sky-b" />
          </linearGradient>
          <radialGradient id="phSunGlow">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="phPanel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e3a8a" />
          </linearGradient>
          <linearGradient id="phScan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="phHeat">
            <stop offset="0" stopColor="#ef4444" stopOpacity="0.9" />
            <stop offset="0.55" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="phCone" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0.04" />
          </linearGradient>
          <clipPath id="phArrayClip">
            <path d="M216.3,186.0 L259.9,211.1 L279.9,178.9 L236.3,153.8 Z" />
            <path d="M262.1,212.4 L305.7,237.6 L325.7,205.4 L282.1,180.2 Z" />
            <path d="M307.9,238.9 L351.5,264.0 L371.5,231.8 L327.9,206.7 Z" />
            <path d="M239.0,149.4 L282.6,174.5 L302.6,142.3 L259.0,117.2 Z" />
            <path d="M284.8,175.8 L328.4,201.0 L348.4,168.8 L304.8,143.6 Z" />
            <path d="M330.6,202.2 L374.2,227.4 L394.2,195.2 L350.6,170.0 Z" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="640" height="450" rx="26" fill="url(#phSky)" />
        <g>
          <circle cx="548.0" cy="74.0" r="56.0" fill="url(#phSunGlow)" fillOpacity="0.55" />
          <circle cx="548.0" cy="74.0" r="20.0" fill="#fbbf24" />
          <circle cx="548.0" cy="74.0" r="14.0" fill="#fde68a" />
        </g>
        <g className="ph-spin">
          <line x1="574.0" y1="74.0" x2="582.0" y2="74.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="570.5" y1="87.0" x2="577.4" y2="91.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="561.0" y1="96.5" x2="565.0" y2="103.4" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="548.0" y1="100.0" x2="548.0" y2="108.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="535.0" y1="96.5" x2="531.0" y2="103.4" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="525.5" y1="87.0" x2="518.6" y2="91.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="522.0" y1="74.0" x2="514.0" y2="74.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="525.5" y1="61.0" x2="518.6" y2="57.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="535.0" y1="51.5" x2="531.0" y2="44.6" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="548.0" y1="48.0" x2="548.0" y2="40.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="561.0" y1="51.5" x2="565.0" y2="44.6" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="570.5" y1="61.0" x2="577.4" y2="57.0" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g className="ph-cloud">
          <ellipse cx="470.0" cy="130.0" rx="24.0" ry="7.2" fill="#ffffff" fillOpacity="0.85" />
          <circle cx="462.0" cy="124.4" r="8.8" fill="#ffffff" fillOpacity="0.85" />
          <circle cx="475.6" cy="122.0" r="10.4" fill="#ffffff" fillOpacity="0.85" />
        </g>
        <g className="ph-cloud">
          <ellipse cx="92.0" cy="190.0" rx="21.0" ry="6.3" fill="#ffffff" fillOpacity="0.7" />
          <circle cx="85.0" cy="185.1" r="7.7" fill="#ffffff" fillOpacity="0.7" />
          <circle cx="96.9" cy="183.0" r="9.1" fill="#ffffff" fillOpacity="0.7" />
        </g>
        <g className="ph-cloud">
          <ellipse cx="210.0" cy="96.0" rx="16.5" ry="5.0" fill="#ffffff" fillOpacity="0.65" />
          <circle cx="204.5" cy="92.2" r="6.1" fill="#ffffff" fillOpacity="0.65" />
          <circle cx="213.8" cy="90.5" r="7.2" fill="#ffffff" fillOpacity="0.65" />
        </g>
        <g>
          <ellipse cx="321.2" cy="162.2" rx="17.1" ry="6.8" fill="#0f172a" fillOpacity="0.18" />
          <rect x="314.7" y="133.9" width="5.0" height="25.3" rx="0.0" fill="#6b4423" />
          <circle cx="310.6" cy="126.1" r="14.8" fill="#238147" />
          <circle cx="324.8" cy="127.1" r="15.2" fill="#2f9e57" />
          <circle cx="317.2" cy="114.2" r="17.1" fill="#3dbb6c" />
          <circle cx="313.4" cy="113.2" r="8.6" fill="#6ee7a0" fillOpacity="0.35" />
        </g>
        <g>
          <ellipse cx="383.2" cy="176.0" rx="13.5" ry="5.4" fill="#0f172a" fillOpacity="0.18" />
          <rect x="376.7" y="153.2" width="5.0" height="19.8" rx="0.0" fill="#6b4423" />
          <circle cx="373.9" cy="147.1" r="11.7" fill="#1f7a45" />
          <circle cx="385.2" cy="147.8" r="12.0" fill="#2a8c4e" />
          <circle cx="379.2" cy="137.7" r="13.5" fill="#37ad62" />
          <circle cx="376.2" cy="137.0" r="6.8" fill="#6ee7a0" fillOpacity="0.35" />
        </g>
        <g>
          <ellipse cx="511.8" cy="261.2" rx="14.4" ry="5.8" fill="#0f172a" fillOpacity="0.18" />
          <rect x="505.3" y="236.2" width="5.0" height="22.0" rx="0.0" fill="#6b4423" />
          <circle cx="502.2" cy="229.4" r="12.5" fill="#1f7a45" />
          <circle cx="514.2" cy="230.2" r="12.8" fill="#2a8c4e" />
          <circle cx="507.8" cy="219.1" r="14.4" fill="#37ad62" />
          <circle cx="504.6" cy="218.2" r="7.2" fill="#6ee7a0" fillOpacity="0.35" />
        </g>
        <ellipse cx="322.0" cy="325.5" rx="205.0" ry="40.0" fill="#0f172a" fillOpacity="0.16" />
        <polygon points="83.8,255.5 322.0,393.0 322.0,408.1 83.8,270.6" fill="#8a5a38" />
        <polygon points="322.0,393.0 560.2,255.5 560.2,270.6 322.0,408.1" fill="#6b4428" />
        <polygon points="322.0,118.0 560.2,255.5 322.0,393.0 83.8,255.5" fill="#58b85f" />
        <polygon points="293.4,134.5 531.6,272.0 514.9,281.6 276.8,144.1" fill="#63c56a" fillOpacity="0.55" />
        <polygon points="245.8,162.0 483.9,299.5 467.3,309.1 229.1,171.6" fill="#63c56a" fillOpacity="0.55" />
        <polygon points="198.2,189.5 436.3,327.0 419.6,336.6 181.5,199.1" fill="#63c56a" fillOpacity="0.55" />
        <polygon points="150.5,217.0 388.7,354.5 372.0,364.1 133.9,226.6" fill="#63c56a" fillOpacity="0.55" />
        <polygon points="276.8,273.4 295.8,284.4 233.9,342.1 176.7,309.1" fill="#e7e0d4" />
        <line x1="256.7" y1="280.5" x2="283.4" y2="295.9" stroke="#cfc6b6" strokeWidth="1" />
        <line x1="236.7" y1="287.7" x2="271.0" y2="307.5" stroke="#cfc6b6" strokeWidth="1" />
        <line x1="216.7" y1="294.8" x2="258.7" y2="319.0" stroke="#cfc6b6" strokeWidth="1" />
        <line x1="196.7" y1="302.0" x2="246.3" y2="330.6" stroke="#cfc6b6" strokeWidth="1" />
        <g>
          <ellipse cx="411.7" cy="324.5" rx="13.5" ry="5.4" fill="#0f172a" fillOpacity="0.18" />
          <rect x="405.2" y="301.7" width="5.0" height="19.8" rx="0.0" fill="#6b4423" />
          <circle cx="402.5" cy="295.6" r="11.7" fill="#238147" />
          <circle cx="413.7" cy="296.3" r="12.0" fill="#2f9e57" />
          <circle cx="407.7" cy="286.2" r="13.5" fill="#3dbb6c" />
          <circle cx="404.7" cy="285.5" r="6.8" fill="#6ee7a0" fillOpacity="0.35" />
        </g>
        <polygon points="217.2,239.0 355.3,318.8 355.3,261.0 217.2,181.2" fill="#f4e8d6" />
        <polygon points="445.8,266.5 355.3,318.8 355.3,261.0 445.8,208.8" fill="#dcc9ae" />
        <polygon points="445.8,208.8 355.3,261.0 400.6,188.1" fill="#dcc9ae" />
        <polygon points="217.2,239.0 355.3,318.8 355.3,314.7 217.2,235.0" fill="#b9a68a" />
        <g>
          <polygon points="231.0,227.3 258.7,243.3 258.7,217.9 231.0,201.9" fill="#7c5a3a" />
          <polygon points="232.7,225.4 257.0,239.4 257.0,219.8 232.7,205.8" fill="#fcd97b" />
          <line x1="244.8" y1="232.4" x2="244.8" y2="212.8" stroke="#7c5a3a" strokeWidth="1.2" />
          <line x1="232.7" y1="215.6" x2="257.0" y2="229.6" stroke="#7c5a3a" strokeWidth="1.2" />
        </g>
        <g>
          <polygon points="313.9,275.2 341.5,291.1 341.5,265.7 313.9,249.8" fill="#7c5a3a" />
          <polygon points="315.6,273.3 339.9,287.3 339.9,267.7 315.6,253.6" fill="#fcd97b" />
          <line x1="327.7" y1="280.3" x2="327.7" y2="260.6" stroke="#7c5a3a" strokeWidth="1.2" />
          <line x1="315.6" y1="263.4" x2="339.9" y2="277.5" stroke="#7c5a3a" strokeWidth="1.2" />
        </g>
        <polygon points="273.8,267.7 298.7,282.0 298.7,247.9 273.8,233.6" fill="#8a4b2a" />
        <line x1="286.3" y1="274.8" x2="286.3" y2="240.8" stroke="#6b3a20" strokeWidth="1" />
        <circle cx="293.9" cy="262.5" r="1.3" fill="#f6d27a" />
        <g>
          <polygon points="418.7,264.9 389.7,281.6 389.7,257.3 418.7,240.6" fill="#7c5a3a" />
          <polygon points="415.8,264.1 392.6,277.5 392.6,258.1 415.8,244.7" fill="#e9d8a6" />
        </g>
        <polygon points="363.7,181.0 380.3,190.6 380.3,144.8 363.7,135.2" fill="#b07a5a" />
        <polygon points="393.4,183.0 380.3,190.6 380.3,144.8 393.4,137.2" fill="#946245" />
        <polygon points="376.8,127.6 393.4,137.2 380.3,144.8 363.7,135.2" fill="#5b4636" />
        <polygon points="198.2,191.1 355.3,281.8 410.1,193.6 252.9,102.9" fill="#5d6673" />
        <line x1="205.8" y1="178.7" x2="363.0" y2="269.5" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <line x1="213.5" y1="166.4" x2="370.7" y2="257.1" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <line x1="221.2" y1="154.0" x2="378.3" y2="244.8" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <line x1="228.8" y1="141.7" x2="386.0" y2="232.4" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <line x1="236.5" y1="129.3" x2="393.7" y2="220.1" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <line x1="244.2" y1="117.0" x2="401.4" y2="207.7" stroke="#4f5764" strokeWidth="0.9" strokeOpacity="0.7" />
        <g>
          <line x1="198.2" y1="191.1" x2="355.3" y2="281.8" stroke="#3a414b" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="355.3" y1="281.8" x2="410.1" y2="193.6" stroke="#4a525d" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="252.9" y1="102.9" x2="410.1" y2="193.6" stroke="#79828f" strokeWidth="1.6" />
        </g>
        <polygon points="216.3,186.0 259.9,211.1 279.9,178.9 236.3,153.8" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <polygon points="262.1,212.4 305.7,237.6 325.7,205.4 282.1,180.2" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <polygon points="307.9,238.9 351.5,264.0 371.5,231.8 327.9,206.7" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <polygon points="239.0,149.4 282.6,174.5 302.6,142.3 259.0,117.2" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <polygon points="284.8,175.8 328.4,201.0 348.4,168.8 304.8,143.6" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <polygon points="330.6,202.2 374.2,227.4 394.2,195.2 350.6,170.0" fill="url(#phPanel)" stroke="#d7dee8" strokeWidth="1.4" />
        <line x1="227.2" y1="192.3" x2="247.2" y2="160.1" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="238.1" y1="198.6" x2="258.1" y2="166.4" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="249.0" y1="204.9" x2="269.0" y2="172.7" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="222.9" y1="175.2" x2="266.5" y2="200.4" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="229.6" y1="164.5" x2="273.2" y2="189.7" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="216.3,186.0 259.9,211.1 263.5,205.3 219.9,180.2" fill="#ffffff" fillOpacity="0.10" />
        <line x1="273.0" y1="218.7" x2="293.0" y2="186.5" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="283.9" y1="225.0" x2="303.9" y2="192.8" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="294.8" y1="231.3" x2="314.8" y2="199.1" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="268.7" y1="201.7" x2="312.3" y2="226.8" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="275.4" y1="190.9" x2="319.0" y2="216.1" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="262.1,212.4 305.7,237.6 309.3,231.8 265.7,206.6" fill="#ffffff" fillOpacity="0.10" />
        <line x1="318.8" y1="245.1" x2="338.8" y2="212.9" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="329.7" y1="251.4" x2="349.7" y2="219.2" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="340.6" y1="257.7" x2="360.6" y2="225.5" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="314.5" y1="228.1" x2="358.1" y2="253.3" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="321.2" y1="217.4" x2="364.8" y2="242.6" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="307.9,238.9 351.5,264.0 355.1,258.2 311.5,233.1" fill="#ffffff" fillOpacity="0.10" />
        <line x1="249.9" y1="155.7" x2="269.9" y2="123.5" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="260.8" y1="162.0" x2="280.8" y2="129.8" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="271.7" y1="168.2" x2="291.7" y2="136.0" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="245.7" y1="138.6" x2="289.3" y2="163.8" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="252.3" y1="127.9" x2="295.9" y2="153.1" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="239.0,149.4 282.6,174.5 286.2,168.7 242.6,143.6" fill="#ffffff" fillOpacity="0.10" />
        <line x1="295.7" y1="182.1" x2="315.7" y2="149.9" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="306.6" y1="188.4" x2="326.6" y2="156.2" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="317.5" y1="194.7" x2="337.5" y2="162.5" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="291.5" y1="165.1" x2="335.1" y2="190.2" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="298.1" y1="154.3" x2="341.7" y2="179.5" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="284.8,175.8 328.4,201.0 332.0,195.2 288.4,170.0" fill="#ffffff" fillOpacity="0.10" />
        <line x1="341.5" y1="208.5" x2="361.5" y2="176.3" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="352.4" y1="214.8" x2="372.4" y2="182.6" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="363.3" y1="221.1" x2="383.3" y2="188.9" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="337.3" y1="191.5" x2="380.9" y2="216.7" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <line x1="343.9" y1="180.8" x2="387.5" y2="205.9" stroke="#9ec5ff" strokeWidth="0.7" strokeOpacity="0.55" />
        <polygon points="330.6,202.2 374.2,227.4 377.8,221.6 334.2,196.4" fill="#ffffff" fillOpacity="0.10" />
        <g clipPath="url(#phArrayClip)">
          <ellipse cx="295.9" cy="208.9" rx="22.0" ry="11.0" fill="url(#phHeat)" className="ph-heat" />
        </g>
        <g clipPath="url(#phArrayClip)">
          <rect x="176.3" y="111.2" width="34" height="158.9" fill="url(#phScan)" className="ph-scan" />
        </g>
        <g>
          <ellipse cx="228.7" cy="256.5" rx="8.4" ry="3.2" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="222.7" cy="251.1" r="5.6" fill="#238147" />
          <circle cx="229.9" cy="250.7" r="6.0" fill="#2f9e57" />
          <circle cx="226.7" cy="247.9" r="5.6" fill="#3dbb6c" />
        </g>
        <g>
          <ellipse cx="252.6" cy="270.2" rx="7.4" ry="2.8" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="247.1" cy="265.4" r="4.9" fill="#238147" />
          <circle cx="253.4" cy="265.1" r="5.2" fill="#34a853" />
          <circle cx="250.6" cy="262.6" r="4.9" fill="#3dbb6c" />
        </g>
        <g>
          <circle cx="225.5" cy="263.2" r="1.8" fill="#fb7185" />
          <circle cx="233.5" cy="260.2" r="1.8" fill="#fb7185" />
          <circle cx="238.5" cy="265.2" r="1.8" fill="#fb7185" />
          <circle cx="229.5" cy="266.2" r="1.8" fill="#fb7185" />
        </g>
        <g>
          <ellipse cx="333.5" cy="317.0" rx="8.4" ry="3.2" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="327.5" cy="311.6" r="5.6" fill="#238147" />
          <circle cx="334.7" cy="311.2" r="6.0" fill="#34a853" />
          <circle cx="331.5" cy="308.4" r="5.6" fill="#3dbb6c" />
        </g>
        <g>
          <ellipse cx="366.9" cy="336.2" rx="9.5" ry="3.6" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="360.4" cy="330.3" r="6.3" fill="#238147" />
          <circle cx="368.5" cy="329.9" r="6.8" fill="#2f9e57" />
          <circle cx="364.9" cy="326.7" r="6.3" fill="#3dbb6c" />
        </g>
        <g>
          <circle cx="335.1" cy="326.5" r="1.8" fill="#fde047" />
          <circle cx="343.1" cy="323.5" r="1.8" fill="#fde047" />
          <circle cx="348.1" cy="328.5" r="1.8" fill="#fde047" />
          <circle cx="339.1" cy="329.5" r="1.8" fill="#fde047" />
        </g>
        <g>
          <ellipse cx="347.8" cy="363.8" rx="8.4" ry="3.2" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="341.8" cy="358.4" r="5.6" fill="#238147" />
          <circle cx="349.0" cy="357.9" r="6.0" fill="#2f9e57" />
          <circle cx="345.8" cy="355.1" r="5.6" fill="#3dbb6c" />
        </g>
        <g>
          <ellipse cx="224.0" cy="204.2" rx="8.4" ry="3.2" fill="#0f172a" fillOpacity="0.18" />
          <circle cx="218.0" cy="198.8" r="5.6" fill="#238147" />
          <circle cx="225.2" cy="198.4" r="6.0" fill="#2f9e57" />
          <circle cx="222.0" cy="195.7" r="5.6" fill="#3dbb6c" />
        </g>
        <g>
          <circle cx="220.7" cy="211.0" r="1.8" fill="#f9a8d4" />
          <circle cx="228.7" cy="208.0" r="1.8" fill="#f9a8d4" />
          <circle cx="233.7" cy="213.0" r="1.8" fill="#f9a8d4" />
          <circle cx="224.7" cy="214.0" r="1.8" fill="#f9a8d4" />
        </g>
        <polygon points="185.0,158.9 259.0,117.2 216.3,186.0" fill="url(#phCone)" className="ph-cone" />
        <g>
          <line x1="185.0" y1="158.9" x2="259.0" y2="117.2" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" className="ph-dash" />
          <line x1="185.0" y1="158.9" x2="216.3" y2="186.0" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" className="ph-dash" />
        </g>
        <g className="ph-pulse">
          <path d="M227.5,192.5 L216.3,186.0" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M223.1,174.9 L216.3,186.0" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M358.3,253.0 L351.5,264.0" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M340.2,257.5 L351.5,264.0" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M382.9,188.7 L394.2,195.2" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M387.3,206.3 L394.2,195.2" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M252.1,128.2 L259.0,117.2" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M270.3,123.7 L259.0,117.2" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </g>
        <g transform="translate(155.3,258.2) scale(1.08)">
          <ellipse cx="0.0" cy="1.0" rx="26.0" ry="7.0" fill="#0f172a" fillOpacity="0.22" />
          <rect x="-11.0" y="-32.0" width="8.5" height="31.0" rx="3.0" fill="#1e293b" />
          <rect x="2.5" y="-32.0" width="8.5" height="31.0" rx="3.0" fill="#243049" />
          <rect x="-13.0" y="-4.0" width="11.0" height="5.5" rx="2.5" fill="#0b1220" />
          <rect x="1.5" y="-4.0" width="11.0" height="5.5" rx="2.5" fill="#0b1220" />
          <rect x="-15.0" y="-64.0" width="30.0" height="36.0" rx="9.0" fill="#f97316" />
          <rect x="-15.0" y="-34.0" width="30.0" height="6.0" rx="3.0" fill="#ea580c" />
          <rect x="-24.0" y="-61.0" width="9.0" height="30.0" rx="4.0" fill="#fb923c" />
          <circle cx="-19.5" cy="-30.0" r="4.6" fill="#b9825b" />
          <rect x="-4.5" y="-72.0" width="9.0" height="10.0" rx="3.0" fill="#b9825b" />
          <circle cx="0.0" cy="-81.0" r="12.5" fill="#b9825b" />
          <path d="M-12.6,-82 C-13,-96 13,-97 12.8,-82 C9,-88 -9,-88 -12.6,-82 Z" fill="#1f1a17" />
          <path d="M13,-62 L26,-79" stroke="#fb923c" strokeWidth="9.5" strokeLinecap="round" fill="none" />
          <circle cx="27.0" cy="-81.0" r="4.7" fill="#b9825b" />
          <g transform="rotate(-12 27 -92)">
            <rect x="21.0" y="-104.0" width="13.0" height="23.0" rx="3.2" fill="#0f172a" />
            <rect x="23.0" y="-102.0" width="9.0" height="19.0" rx="1.8" fill="#38bdf8" />
            <rect x="24.5" y="-101.0" width="3.0" height="17.0" rx="1.0" fill="#e0f2fe" fillOpacity="0.55" />
          </g>
        </g>
        <g className="ph-float">
          <rect x="36.0" y="35.0" width="172.0" height="112.0" rx="14.0" fill="#0f172a" fillOpacity="0.12" />
          <rect x="34.0" y="30.0" width="172.0" height="112.0" rx="14.0" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
          <text x="48.0" y="52.0" fontSize="9.5" fontWeight="700" letterSpacing="1.1" fill="#64748b" fontFamily="ui-sans-serif, system-ui, sans-serif">HEALTH SCORE</text>
          <text x="48.0" y="92.0" fontSize="38" fontWeight="700" fill="#0f172a" fontFamily="ui-sans-serif, system-ui, sans-serif">84</text>
          <text x="108.0" y="92.0" fontSize="13" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui, sans-serif">/ 100</text>
          <rect x="48.0" y="102.0" width="144.0" height="6.0" rx="3.0" fill="#e2e8f0" />
          <rect x="48.0" y="102.0" width="121.0" height="6.0" rx="3.0" fill="#10b981" />
          <rect x="48.0" y="118.0" width="66.0" height="16.0" rx="8.0" fill="#d1fae5" />
          <circle cx="59.0" cy="126.0" r="4.2" fill="#10b981" />
          <path d="M56.6,126.0 L58.6,128.0 L62.0,123.8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <text x="68.0" y="130.0" fontSize="10" fontWeight="700" fill="#047857" fontFamily="ui-sans-serif, system-ui, sans-serif">Healthy</text>
          <text x="192.0" y="130.0" fontSize="9.5" fontWeight="600" fill="#475569" textAnchor="end" fontFamily="ui-sans-serif, system-ui, sans-serif">252-325 W</text>
        </g>
        <g className="ph-pulse">
          <path d="M208.0,20.0 l2.6,6 l6,2.6 l-6,2.6 l-2.6,6 l-2.6,-6 l-6,-2.6 l6,-2.6 z" fill="#fbbf24" />
        </g>
      </svg>
    </>
  )
}
