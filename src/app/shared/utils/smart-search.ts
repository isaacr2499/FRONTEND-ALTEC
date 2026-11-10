/**
 * Búsqueda "inteligente" para la tienda, sin servidor ni librerías:
 * entiende tildes, mayúsculas, espacios de más o de menos ("arduinouno", "lm 386"),
 * plurales, errores de tipeo ("arduno", "rezistencia"), cómo suena la palabra
 * (b/v, s/z/c, ll/y, h muda) y sinónimos de electrónica ("condensador" → "filtro").
 *
 * Uso: const engine = new SmartSearch(productos, p => [p.descripcion, p.codigo, p.categoria]);
 *      engine.search('capasitor 1000 uf') → { items, related, suggestion }
 */

export interface SmartSearchResult<T> {
  /** Productos que cumplen todas las palabras buscadas, del más al menos parecido. */
  items: T[];
  /** true si no hubo coincidencias completas y se muestran productos parecidos. */
  related: boolean;
  /** Búsqueda corregida para "¿Quisiste decir…?" (null si no hace falta). */
  suggestion: string | null;
}

/** Grupos de palabras que el cliente usa para lo mismo (ya normalizadas, sin tildes). */
const SYNONYM_GROUPS: string[][] = [
  ['condensador', 'capacitor', 'filtro', 'cap', 'electrolitico'],
  ['resistencia', 'resistor', 'res'],
  ['bateria', 'pila', 'cell', 'acumulador', 'lipo'],
  ['cargador', 'fuente', 'adaptador', 'eliminador', 'transformador', 'trafo'],
  ['cable', 'conductor', 'alambre', 'jumper', 'dupont'],
  ['led', 'luz'],
  ['parlante', 'altavoz', 'bocina', 'speaker', 'altoparlante'],
  ['audifono', 'auricular', 'headphone', 'headset'],
  ['interruptor', 'switch', 'sw', 'suiche', 'suich', 'swich'],
  ['pulsador', 'boton', 'push', 'pushbutton'],
  ['potenciometro', 'pot', 'trimmer', 'perilla'],
  ['cautin', 'soldador', 'soldering'],
  ['estano', 'soldadura', 'tin'],
  ['multimetro', 'tester', 'polimetro'],
  ['rele', 'relay', 'relevador'],
  ['servo', 'servomotor'],
  ['motor', 'motorreductor', 'micromotor', 'reductor'],
  ['buzzer', 'zumbador', 'chicharra', 'pito'],
  ['pantalla', 'display', 'lcd', 'oled', 'tft'],
  ['sensor', 'detector'],
  ['protoboard', 'breadboard'],
  ['baquelita', 'placa perforada', 'pcb', 'tarjeta perforada'],
  ['camara', 'webcam', 'cam'],
  ['bluetooth', 'blutu', 'blutooth', 'bluethoot'],
  ['wifi', 'wi fi', 'inalambrico'],
  ['arduino', 'ardu'],
  ['esp32', 'esp 32'],
  ['esp8266', 'nodemcu', 'wemos'],
  ['regulador', 'buck'],
  ['elevador', 'boost'],
  ['integrado', 'ic', 'chip', 'circuito integrado', 'compuerta'],
  ['transistor', 'mosfet'],
  ['conector', 'plug', 'jack', 'terminal', 'bornera'],
  ['control remoto', 'mando', 'control'],
  ['ventilador', 'cooler', 'fan'],
  ['iman', 'magneto', 'neodimio'],
  ['fusible', 'fuse'],
  ['voltaje', 'voltios'],
  ['microfono', 'mic'],
  ['carro', 'auto', 'coche', 'robot', 'chasis'],
  ['brazo', 'brazo robotico']
];

/** Palabras que no aportan a la búsqueda. */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'con',
  'para', 'por', 'a', 'al', 'que', 'se', 'su', 'sus', 'mi', 'me', 'quiero', 'busco', 'necesito',
  'tiene', 'tienen', 'hay', 'venden', 'precio'
]);

interface IndexedDoc<T> {
  item: T;
  words: string[];          // palabras normalizadas del producto
  wordSet: Set<string>;
  compact: string;          // todo junto, sin espacios ni símbolos
  primary: string;          // texto principal normalizado (descripción)
  head: string;             // primera palabra de la descripción: suele ser qué es el producto
  code: string;             // código normalizado
}

export class SmartSearch<T> {
  private docs: IndexedDoc<T>[];
  private vocabulary = new Set<string>();
  private synonymOf = new Map<string, Set<string>>();
  private phoneticVocab = new Map<string, string[]>();

  /**
   * @param fields devuelve [descripción, código, categoría…] de cada producto.
   * @param inStock opcional: los productos con stock suben un poco en el orden.
   */
  constructor(items: T[], private fields: (item: T) => (string | null | undefined)[],
              private inStock?: (item: T) => boolean) {
    for (const group of SYNONYM_GROUPS) {
      const set = new Set(group.map(w => SmartSearch.normalize(w)));
      for (const w of set) this.synonymOf.set(w, set);
    }

    this.docs = items.map(item => {
      const [primary = '', code = '', ...rest] = fields(item).map(f => SmartSearch.normalize(f ?? ''));
      const all = [primary, code, ...rest].join(' ');
      const words = SmartSearch.words(all);
      words.forEach(w => this.vocabulary.add(w));
      const head = SmartSearch.singular(primary.split(' ').find(w => w && w !== 'mini' && w !== 'modulo') ?? '');
      return { item, words, wordSet: new Set(words), compact: all.replace(/[^a-z0-9]/g, ''), primary, head, code: code.replace(/\s/g, '') };
    });

    for (const w of this.vocabulary) {
      const key = SmartSearch.phonetic(w);
      const list = this.phoneticVocab.get(key) ?? [];
      list.push(w);
      this.phoneticVocab.set(key, list);
    }
  }

  // ── Normalización ──────────────────────────────────────────────────────

  /** minúsculas, sin tildes, símbolos de unidades a texto y separadores a espacio. */
  static normalize(text: string): string {
    return (text || '')
      .replace(/Ω/g, ' ohm ')
      .replace(/[µμ]/g, 'u')
      .replace(/º|°/g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9.,]+/g, ' ')
      .replace(/(\d)[.,](\d)/g, '$1.$2')
      .replace(/[.,](?!\d)|(?<!\d)[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Palabras: además separa letras de números ("5v" → "5v","5","v"; "lm386" → "lm386","lm","386"). */
  static words(norm: string): string[] {
    const out: string[] = [];
    for (const w of norm.split(' ')) {
      if (!w) continue;
      out.push(w);
      const parts = w.match(/[a-z]+|\d+(?:\.\d+)?/g);
      if (parts && parts.length > 1) out.push(...parts);
      const s = SmartSearch.singular(w);
      if (s !== w) out.push(s);
    }
    return out;
  }

  /** Plural → singular en español/inglés ("baterias" → "bateria", "leds" → "led"). */
  static singular(w: string): string {
    if (w.length <= 3 || /\d/.test(w)) return w;
    if (w.endsWith('ces')) return w.slice(0, -3) + 'z';
    if (w.endsWith('es') && w.length > 4 && /[rlndj]es$/.test(w)) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }

  /** Cómo suena en español: b/v, s/z/c, ll/y, k/qu/c, h muda, j/g y letras dobles. */
  static phonetic(w: string): string {
    return w
      .replace(/h/g, '')
      .replace(/qu/g, 'k').replace(/c([eiy])/g, 's$1').replace(/c/g, 'k')
      .replace(/z/g, 's').replace(/v/g, 'b').replace(/w/g, 'b')
      .replace(/ll/g, 'y').replace(/x/g, 'ks')
      .replace(/g([ei])/g, 'j$1')
      .replace(/(.)\1+/g, '$1');
  }

  /** Distancia de edición con transposiciones (Damerau-Levenshtein), con tope. */
  static distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d: number[][] = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }

  // ── Búsqueda ───────────────────────────────────────────────────────────

  search(query: string): SmartSearchResult<T> {
    const norm = SmartSearch.normalize(query);
    const tokens = norm.split(' ').filter(t => t && !STOPWORDS.has(t));
    if (!tokens.length) return { items: this.docs.map(d => d.item), related: false, suggestion: null };

    // Para cada palabra buscada: qué tan bien encaja con cada palabra del catálogo (0..1)
    const tokenMatches = tokens.map(t => this.matchesFor(t));
    const queryCompact = norm.replace(/[^a-z0-9]/g, '');

    const scored = this.docs.map(doc => {
      let total = 0;
      let matched = 0;
      tokens.forEach((t, i) => {
        let best = 0;
        for (const w of doc.words) {
          const s = tokenMatches[i].get(w);
          if (s && s > best) best = s;
          if (best === 1) break;
        }
        // Palabra pegada o partida distinto ("arduinouno" / "lm 386"): buscar dentro del texto compacto
        if (best < 0.8 && t.length >= 4 && doc.compact.includes(t)) best = Math.max(best, 0.8);
        if (best > 0) matched++;
        total += best;
      });

      let score = total / tokens.length;
      // La palabra buscada es lo que el producto ES ("botón" → PULSADOR…, no "PILA … BOTÓN")
      const headHits = tokenMatches.reduce((sum, m) => {
        const v = m.get(doc.head) ?? 0;
        return sum + (v >= 0.6 ? v : 0);
      }, 0);
      score += 0.2 * headHits / tokens.length;
      if (tokens.length > 1 && queryCompact.length >= 4 && doc.compact.includes(queryCompact)) score += 0.35;   // frase completa
      if (doc.primary.startsWith(norm)) score += 0.25;                                      // empieza igual
      if (doc.code && doc.code === queryCompact) score += 1;                                // código exacto
      if (this.inStock && this.inStock(doc.item)) score += 0.05;                             // con stock primero
      return { doc, score, matched };
    });

    const full = scored.filter(s => s.matched === tokens.length && s.score >= 0.5);
    let pool = full;
    let related = false;
    if (!pool.length) {
      // Nada cumple todo: mostrar lo más parecido (al menos la mitad de las palabras)
      const need = Math.max(1, Math.ceil(tokens.length / 2));
      pool = scored.filter(s => s.matched >= need && s.score >= 0.3);
      related = pool.length > 0;
    }
    pool.sort((a, b) => b.score - a.score);

    return { items: pool.map(s => s.doc.item), related, suggestion: this.suggest(tokens) };
  }

  /** Mapa palabra del catálogo → puntaje para un término buscado. */
  private matchesFor(token: string): Map<string, number> {
    const out = new Map<string, number>();
    const put = (w: string, s: number) => { if ((out.get(w) ?? 0) < s) out.set(w, s); };
    const tokenSing = SmartSearch.singular(token);
    const hasDigit = /\d/.test(token);

    // 1) Exacto, plural y prefijo (mientras se escribe)
    for (const w of this.vocabulary) {
      if (w === token || w === tokenSing) put(w, 1);
      else if (token.length >= 2 && w.startsWith(token)) put(w, hasDigit ? 0.85 : 0.9);
      else if (token.length >= 3 && !hasDigit && w.includes(token)) put(w, 0.7);
    }

    // 2) Sinónimos ("condensador" encuentra "filtro")
    for (const t of [token, tokenSing]) {
      const syns = this.synonymOf.get(t);
      if (!syns) continue;
      for (const s of syns) {
        for (const part of this.synonymParts(s)) put(part, 0.85);
      }
    }

    // 3) Errores de tipeo y cómo suena (solo palabras, no códigos con números)
    if (!hasDigit && token.length >= 4) {
      const max = token.length >= 7 ? 2 : 1;
      for (const w of this.vocabulary) {
        if (out.has(w) || /\d/.test(w) || Math.abs(w.length - token.length) > max) continue;
        const dist = SmartSearch.distance(token, w, max);
        if (dist <= max) put(w, dist === 1 ? 0.75 : 0.6);
      }
      for (const w of this.phoneticVocab.get(SmartSearch.phonetic(token)) ?? []) put(w, 0.75);
      // Sinónimos de la palabra corregida ("capasitor" → "capacitor" → "filtro")
      for (const [w, s] of Array.from(out)) {
        if (s < 0.6 || this.synonymOf.get(w) === undefined) continue;
        for (const syn of this.synonymOf.get(w)!) {
          for (const part of this.synonymParts(syn)) put(part, Math.min(s * 0.9, 0.7));
        }
      }
    }

    // 4) Códigos con números: "7805" encuentra "lm7805"; "lm 386" ya se cubre con el texto compacto
    if (hasDigit && token.length >= 3) {
      for (const w of this.vocabulary) if (w !== token && w.endsWith(token)) put(w, 0.85);
    }
    return out;
  }

  /** Partes útiles de un sinónimo de varias palabras (sin "de", "la"… ni palabras de 1-2 letras). */
  private synonymParts(synonym: string): string[] {
    return synonym.split(' ').filter(p => p.length >= 2 && !STOPWORDS.has(p) && this.vocabulary.has(p));
  }

  /** "¿Quisiste decir…?": corrige las palabras que no existen en el catálogo. */
  private suggest(tokens: string[]): string | null {
    let changed = false;
    const fixed = tokens.map(t => {
      if (this.vocabulary.has(t) || this.vocabulary.has(SmartSearch.singular(t)) || /\d/.test(t) || t.length < 4) return t;
      if (this.synonymOf.has(t)) return t;                      // palabra válida que no está en el catálogo
      if (this.docs.some(d => d.compact.includes(t))) return t;  // palabras pegadas ("arduinouno")
      const max = t.length >= 7 ? 2 : 1;
      let best: string | null = null;
      let bestDist = max + 1;
      const phon = this.phoneticVocab.get(SmartSearch.phonetic(t));
      if (phon?.length) { best = phon[0]; bestDist = 0; }
      for (const w of this.vocabulary) {
        if (bestDist === 0) break;
        if (/\d/.test(w) || Math.abs(w.length - t.length) > max) continue;
        const dist = SmartSearch.distance(t, w, max);
        if (dist < bestDist) { bestDist = dist; best = w; }
      }
      if (bestDist > max) best = null;
      if (best && best !== t) { changed = true; return best; }
      return t;
    });
    return changed ? fixed.join(' ') : null;
  }
}

/**
 * Atajo para pantallas que ya tienen sus propios filtros (categoría, stock…):
 * guarda el índice y lo rehace solo cuando cambia la lista de productos.
 */
export class SmartSearchCache<T> {
  private source: T[] | null = null;
  private engine: SmartSearch<T> | null = null;

  constructor(private fields: (item: T) => (string | null | undefined)[],
              private inStock?: (item: T) => boolean) { }

  /** Busca en `all` y devuelve, en orden de relevancia, solo los que están en `allowed`. */
  filter(all: T[], allowed: T[], query: string): SmartSearchResult<T> {
    if (this.source !== all || !this.engine) {
      this.engine = new SmartSearch<T>(all, this.fields, this.inStock);
      this.source = all;
    }
    const result = this.engine.search(query);
    const ok = allowed === all ? null : new Set(allowed);
    return { ...result, items: ok ? result.items.filter(i => ok.has(i)) : result.items };
  }

  /** Llamar si se reemplaza un producto dentro de la misma lista. */
  invalidate(): void {
    this.source = null;
  }
}
