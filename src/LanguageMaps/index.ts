import { keycode, modifierkeytype } from "../QMK/keycodes";
import { keycodeToUsbcode, isKeycode } from "../QMK";
import { KeycapText } from "../Components/Key";
import { LANGS } from "../Langs";
import { QmkFunctionResult } from "../QMK/functions";
import { ReferenceKeyboardKey } from "../ReferenceKeyboards/index";

export type keytypes = "normal" | "shifted" | "altgr" | "altgrshifted";

interface LanguageCsvFormat {
    usbcode: number;

    // Symbols produced
    normal: string;
    shifted: string;
    altgr: string;
    altgrshifted: string;

    deadkeys: string; // deadkeys separated by space, e.g. "normal shifted"

    // Presentation on keycap
    bottomleft: string; // normal
    topleft: string; // shifted
    bottomright: string; // altgr
    topright: string; // altgrshifted
    centerleft: string; // Not used normally
    centered: string; // command keys, e.g. Delete
    centerright: string; // Not used normally

    // Name (if differs from keycap presentation)
    name: string;
}

interface LanguageMappingOpts {
    lang: string;
    name: string;
    referenceKeyboard: ReferenceKeyboardKey;
    mapping: LanguageCsvFormat[];
}

export interface ILanguageMapping {
    lang: string;
    name: string;
    referenceKeyboard: ReferenceKeyboardKey;
    getKeycapTextFromUsbcode(usbcode: number): KeycapText | null;
    renderExpr(expr: QmkFunctionResult): QmkFunctionResult;
}

export class LanguageMapping implements ILanguageMapping {
    public readonly lang: string;
    public readonly name: string;
    public readonly referenceKeyboard: ReferenceKeyboardKey;
    protected readonly mapping: Map<number, LanguageCsvFormat>;

    constructor(opts: LanguageMappingOpts) {
        this.lang = opts.lang;
        this.name = opts.name;
        this.mapping = new Map();
        this.referenceKeyboard = opts.referenceKeyboard;
        opts.mapping.forEach(t => {
            this.mapping.set(+t.usbcode, t);
        });
    }

    // This can be overridden in some really weird mappings by inheriting from
    // this class
    public getKeycapTextFromUsbcode = (usbcode: number): KeycapText | null => {
        if (this.mapping.has(usbcode)) {
            let m = this.mapping.get(usbcode);
            if (!m) {
                return null;
            }
            if (
                m.bottomleft ||
                m.topleft ||
                m.bottomright ||
                m.topright ||
                m.centerleft ||
                m.centered ||
                m.centerright
            ) {
                return {
                    bottomleft: m.bottomleft,
                    topleft: m.topleft,
                    bottomright: m.bottomright,
                    topright: m.topright,
                    centerleft: m.centerleft,
                    centered: m.centered,
                    centerright: m.centerright,
                };
            }
            return {
                bottomleft: m.normal,
                topleft: m.shifted,
                bottomright: m.altgr,
                topright: m.altgrshifted,
            };
        }
        return null;
    };

    public renderExpr = (expr: QmkFunctionResult): QmkFunctionResult => {
        if (isKeycode(expr)) {
            let usbcode = keycodeToUsbcode(expr);
            if (usbcode !== null) {
                let rendered = this.getKeycapTextFromUsbcode(usbcode);
                let sym = this.getSymbol("normal", usbcode);

                // Symbol producing key
                if (sym !== "") {
                    return {
                        type: "langsymbol",
                        keycode: expr,
                        rendered: rendered || { centered: sym },
                        mods: [],
                        symbol: sym,
                    };
                }

                // Some other known key in the language
                if (rendered !== null) {
                    return {
                        type: "langkeycode",
                        keycode: expr,
                        rendered: rendered,
                    };
                }
            }
        } else if (typeof expr === "string") {
            return expr;
        } else if (expr.type === "modresult") {
            let usbcode = keycodeToUsbcode(expr.keycode);
            if (usbcode === null) {
                return expr;
            }

            // Modified symbol, e.g. shift+7 === "/" (finnish keyboards)
            let symMods = this.getSymbolWithModifiers(expr.mods, usbcode);
            if (symMods) {
                return {
                    type: "langsymbol",
                    keycode: expr.keycode,
                    symbol: symMods,
                    rendered: {
                        centered: symMods.toUpperCase(),
                    },
                    mods: expr.mods,
                };
            }

            // Convert the centered keycode to symbol
            let sym = this.getSymbol("normal", usbcode);
            if (sym) {
                return Object.assign({}, expr, {
                    rendered: Object.assign({}, expr.rendered, {
                        centered: sym.toUpperCase(),
                    }),
                });
            }
        } else if (expr.rendered) {
            let kc = expr.rendered.centered;
            if (!isKeycode(kc)) {
                return expr;
            }
            let usbcode = keycodeToUsbcode(kc);
            if (usbcode === null) {
                return expr;
            }
            let text =
                this.getSymbol("normal", usbcode).toUpperCase() || this.getCenteredText(usbcode);

            return Object.assign({}, expr, {
                rendered: Object.assign({}, expr.rendered, {
                    centered: text,
                }),
            });
        }
        return expr;
    };

    protected producesSymbol = (usbcode: number): boolean => {
        if (this.mapping.has(usbcode)) {
            let m = this.mapping.get(usbcode);
            return (
                !!m &&
                (m.normal !== "" || m.shifted !== "" || m.altgr !== "" || m.altgrshifted !== "")
            );
        }
        return false;
    };

    protected getSymbolWithModifiers = (
        mods: modifierkeytype[],
        usbcode: number
    ): string | null => {
        if (mods.length === 1) {
            // Shifted symbol in CSV
            if (mods[0] === "KC_LSHIFT" || mods[0] === "KC_RSHIFT") {
                return this.getSymbol("shifted", usbcode);
            }

            // Altgr symbol in CSV
            if (mods[0] === "KC_RALT") {
                return this.getSymbol("altgr", usbcode);
            }
        } else if (mods.length === 2) {
            // Altgrshifted symbol in CSV
            if (
                mods.indexOf("KC_RALT") !== -1 &&
                (mods.indexOf("KC_LSHIFT") !== -1 || mods.indexOf("KC_RSHIFT") !== -1)
            ) {
                return this.getSymbol("altgrshifted", usbcode);
            }
        }
        return null;
    };

    protected getSymbol = (key: keytypes, usbcode: number): string => {
        let val = this.mapping.get(usbcode);
        if (val) {
            return val[key];
        }
        return "";
    };
    protected getCenteredText = (usbcode: number): string => {
        let val = this.mapping.get(usbcode);
        if (val) {
            return val["centered"];
        }
        return "";
    };
}

const languageMappingIndex = {
    us: new LanguageMapping({
        lang: "US",
        mapping: require("./Data/us.csv"),
        name: LANGS.UsStandardKeyboard,
        referenceKeyboard: "ansi104",
    }),
    uk: new LanguageMapping({
        lang: "EN-GB",
        mapping: require("./Data/uk.csv"),
        name: LANGS.UkKeyboard,
        referenceKeyboard: "iso105",
    }),
    fi: new LanguageMapping({
        lang: "FI",
        mapping: require("./Data/fi.csv"),
        name: LANGS.FinnishStandardKeyboard,
        referenceKeyboard: "iso105",
    }),
};

export const languageMappings: { [k: string]: ILanguageMapping } = languageMappingIndex;

export type LanguageMappingKey = keyof typeof languageMappingIndex;
