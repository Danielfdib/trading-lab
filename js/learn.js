'use strict';
/* =========================================================
   Aprende: lecciones para principiantes
   ========================================================= */

const go = (tab, txt) => `<button class="btn sm go" data-go="${tab}">${txt} →</button>`;
const LESSONS = [
  // ---------- Fundamentos ----------
  { cat: 'Fundamentos', title: 'Velas japonesas', body: `
    <p>Cada vela resume el precio en un periodo: <b>apertura</b>, <b>máximo</b>, <b>mínimo</b> y <b>cierre</b>. El cuerpo va de la apertura al cierre; las mechas marcan el máximo y el mínimo.</p>
    <ul><li><span class="pos">Verde</span>: cerró más arriba de lo que abrió (compradores ganaron).</li><li><span class="neg">Roja</span>: cerró más abajo (vendedores ganaron).</li><li>Mechas largas = rechazo de esos precios.</li></ul>
    ${go('sim', 'Mirar velas en el simulador')}` },
  { cat: 'Fundamentos', title: 'Tendencia, soporte y resistencia', body: `
    <p><b>Tendencia alcista</b>: máximos y mínimos cada vez más altos. <b>Bajista</b>: cada vez más bajos. <b>Lateral</b>: el precio rebota entre un techo y un suelo.</p>
    <p><b>Soporte</b> es una zona donde el precio tiende a dejar de caer (aparecen compradores). <b>Resistencia</b>, donde tiende a dejar de subir. Cuando se rompen con fuerza, a menudo cambian de rol.</p>
    <p>Regla de oro: <i>“la tendencia es tu amiga”</i>. Operar a favor de ella suele ser más fácil que adivinar giros.</p>
    ${go('challenges', 'Practicar con el reto “Rey del rango”')}` },
  { cat: 'Fundamentos', title: 'Largo vs. corto', body: `
    <p><b>Largo (comprar)</b>: ganas si el precio sube. <b>Corto (vender)</b>: vendes algo prestado y lo recompras después; ganas si el precio baja.</p>
    <p>En el simulador puedes hacer ambas cosas con el selector “Comprar / Vender”.</p>` },
  { cat: 'Fundamentos', title: 'Volatilidad y ATR', body: `
    <p>La <b>volatilidad</b> mide cuánto se mueve el precio. El <b>ATR</b> (Average True Range) es el rango medio de las últimas 14 velas, en dólares.</p>
    <p>Sirve para poner stops lógicos: un stop a 1.5–2 ATR queda fuera del “ruido” normal. En mercados volátiles el ATR crece y tu stop se aleja automáticamente; el tamaño de posición por riesgo % se reduce para compensar.</p>` },

  // ---------- Indicadores ----------
  { cat: 'Indicadores', title: 'Medias móviles (SMA y EMA)', body: `
    <p>La <b>SMA</b> promedia los últimos N cierres. La <b>EMA</b> da más peso a los recientes (reacciona antes). Suavizan el ruido y muestran la tendencia.</p>
    <ul><li>Precio por encima de la media = sesgo alcista.</li><li>Cruce de una media rápida sobre una lenta = posible inicio de tendencia (“cruce dorado”).</li><li>Las medias van <b>retrasadas</b>: siempre confirman tarde.</li></ul>
    ${go('sim', 'Activar SMA 20 / 50')}` },
  { cat: 'Indicadores', title: 'RSI (Índice de Fuerza Relativa)', body: `
    <p>Oscila entre 0 y 100 y mide la fuerza de las subidas frente a las bajadas recientes.</p>
    <ul><li><b>&gt; 70</b>: sobrecompra (subió mucho y rápido).</li><li><b>&lt; 30</b>: sobreventa.</li></ul>
    <p>⚠ En una tendencia fuerte el RSI puede quedarse en sobrecompra mucho tiempo. Vender solo porque el RSI está alto es una trampa clásica.</p>` },
  { cat: 'Indicadores', title: 'MACD', body: `
    <p>Diferencia entre una EMA de 12 y otra de 26 (línea MACD), más una EMA de 9 de esa línea (señal). El histograma es la diferencia entre ambas.</p>
    <p>Cruce de la línea sobre la señal = momentum alcista; por debajo = bajista. Útil para detectar aceleraciones y pérdidas de fuerza.</p>` },
  { cat: 'Indicadores', title: 'Bandas de Bollinger', body: `
    <p>Una media de 20 con dos bandas a ±2 desviaciones estándar. Aproximadamente el 95% del precio queda dentro.</p>
    <ul><li>En rangos: tocar la banda inferior suele ser “barato”, la superior “caro”.</li><li>Bandas que se estrechan = calma antes de un movimiento fuerte.</li><li>En tendencias, el precio puede “caminar” por una banda.</li></ul>` },
  { cat: 'Indicadores', title: 'Canal de Donchian y rupturas', body: `
    <p>Marca el máximo y el mínimo de las últimas N velas. Romper el máximo de 20 velas indica que los compradores tomaron el control: es la base del famoso sistema de las <b>Tortugas</b>.</p>` },

  // ---------- Estrategias ----------
  { cat: 'Estrategias', title: 'Seguimiento de tendencia', body: `
    <p>Entrar cuando una tendencia ya empezó (cruce de medias, ruptura) y quedarse mientras dure, con un trailing stop.</p>
    <p><b>Perfil</b>: aciertas 30–45% de las veces, pero las ganadoras son 2–5 veces más grandes que las perdedoras. Sufre en mercados laterales.</p>
    ${go('sim', 'Probar el bot “Cruce de medias”')}` },
  { cat: 'Estrategias', title: 'Reversión a la media', body: `
    <p>Apostar a que un movimiento exagerado se corregirá: comprar en sobreventa (RSI &lt; 30, banda inferior) y vender en sobrecompra.</p>
    <p><b>Perfil</b>: aciertas 55–70%, ganancias pequeñas. El peligro: una tendencia fuerte que “nunca vuelve”. Siempre con stop.</p>` },
  { cat: 'Estrategias', title: 'Rupturas (breakouts)', body: `
    <p>Entrar cuando el precio supera una resistencia o rompe un soporte, esperando que se acelere. Muchas rupturas son falsas, por eso se combinan con stops y, a veces, con volumen alto como confirmación.</p>` },
  { cat: 'Estrategias', title: 'Tendencia + retroceso (pullback)', body: `
    <p>Esperar una tendencia clara (precio sobre la EMA 100) y comprar cuando el precio retrocede y vuelve a girar (RSI rebota desde 40). Mejor precio de entrada que comprar la ruptura, a cambio de perder algunos movimientos.</p>` },

  // ---------- Gestión de riesgo ----------
  { cat: 'Gestión de riesgo', title: 'Stop loss', body: `
    <p>Es la orden que te saca cuando la operación demuestra que estabas equivocado. Sin stop, una sola operación puede destruir la cuenta.</p>
    <ul><li>Ponlo donde tu idea queda invalidada (debajo de un soporte, a 1.5–2 ATR), no donde “te duela menos”.</li><li>Nunca lo alejes cuando el precio va en tu contra.</li></ul>` },
  { cat: 'Gestión de riesgo', title: 'Take profit y ratio R:R', body: `
    <p><b>R</b> es lo que arriesgas en una operación. Si arriesgas $100 y tu objetivo paga $200, tu R:R es <b>1:2</b>.</p>
    <p>Acierto mínimo para no perder = <code>1 / (1 + R:R)</code>:</p>
    <table class="mini-tbl"><tr><th>R:R</th><td>1:0.5</td><td>1:1</td><td>1:1.5</td><td>1:2</td><td>1:3</td></tr><tr><th>Acierto mínimo</th><td>67%</td><td>50%</td><td>40%</td><td>33%</td><td>25%</td></tr></table>
    ${go('mc', 'Experimentar en Probabilidad')}` },
  { cat: 'Gestión de riesgo', title: 'Tamaño de posición (regla del 1%)', body: `
    <p>Decide primero <b>cuánto puedes perder</b> (p. ej. 1% del capital) y deduce cuántas unidades comprar:</p>
    <p><code>Cantidad = (Capital × Riesgo%) ÷ Distancia al stop</code></p>
    <p>Ejemplo: $10.000, riesgo 1% = $100. Entras a 50 con stop en 48 (distancia $2) → compras 50 unidades. Si salta el stop pierdes exactamente $100.</p>
    <p>El simulador lo calcula por ti con el modo “Riesgo % del capital”.</p>` },
  { cat: 'Gestión de riesgo', title: 'Trailing stop', body: `
    <p>Un stop que sigue al precio a una distancia fija cuando va a tu favor (nunca retrocede). Permite dejar correr las ganancias en tendencias y proteger lo ganado.</p>` },
  { cat: 'Gestión de riesgo', title: 'Apalancamiento', body: `
    <p>Operar con más dinero del que tienes. Multiplica ganancias <b>y pérdidas</b>. Lo que importa de verdad no es el apalancamiento sino el <b>riesgo por operación</b>: con un stop cercano puedes usar 3× y arriesgar solo 1%.</p>` },
  { cat: 'Gestión de riesgo', title: 'Drawdown: la matemática de recuperarse', body: `
    <p>Drawdown es la caída desde tu máximo. Recuperarse cuesta más de lo que se perdió:</p>
    <table class="mini-tbl"><tr><th>Pérdida</th><td>-10%</td><td>-20%</td><td>-30%</td><td>-50%</td><td>-75%</td><td>-90%</td></tr><tr><th>Para recuperar</th><td>+11%</td><td>+25%</td><td>+43%</td><td>+100%</td><td>+300%</td><td>+900%</td></tr></table>
    <p>Por eso proteger el capital es lo primero.</p>` },

  // ---------- Probabilidad ----------
  { cat: 'Probabilidad', title: 'Expectativa matemática', body: `
    <p><code>Expectativa = %acierto × ganancia media − %fallo × pérdida media</code></p>
    <p>Si es positiva, la estrategia gana a largo plazo; si es negativa, pierde, sin importar lo bien que te vaya en una racha. En unidades de R: <code>W × R:R − (1 − W)</code>.</p>
    ${go('mc', 'Calcular mi expectativa')}` },
  { cat: 'Probabilidad', title: 'Criterio de Kelly', body: `
    <p>Fórmula que indica el % del capital que maximiza el crecimiento a largo plazo: <code>K = W − (1 − W) / R:R</code>.</p>
    <p>En la práctica se usa <b>medio Kelly o menos</b>, porque tus estimaciones de W y R:R son imprecisas y el Kelly completo produce drawdowns brutales. Arriesgar más de 2× Kelly hace que pierdas dinero incluso con una estrategia ganadora.</p>` },
  { cat: 'Probabilidad', title: 'Rachas perdedoras', body: `
    <p>Con un 50% de acierto y 200 operaciones, la probabilidad de sufrir al menos 6 pérdidas seguidas es del 80%. Con 40% de acierto, una racha de 8 seguidas ocurre el 75% de las veces. Las rachas no significan que la estrategia “dejó de funcionar”; son estadística pura.</p>` },
  { cat: 'Probabilidad', title: 'Monte Carlo', body: `
    <p>Simular miles de secuencias posibles de operaciones para ver el <b>rango</b> de resultados, no solo el promedio: mejor caso, peor caso, drawdown típico y probabilidad de ruina.</p>` },
  { cat: 'Probabilidad', title: 'Sobreajuste (overfitting) y robustez', body: `
    <p>Si ajustas reglas hasta que un backtest se ve perfecto, probablemente solo memorizaste el ruido de ese gráfico. La prueba real: ¿funciona en <b>muchos mercados distintos</b>? Para eso está el botón “Robustez (20 mercados)” del bot.</p>` },
  { cat: 'Probabilidad', title: '¿Habilidad o suerte? (prueba binomial)', body: `
    <p>Si aciertas 12 de 20 predicciones (60%), parece habilidad… pero lanzando una moneda eso ocurre el 25% de las veces. Necesitas muestras grandes: con 200 predicciones, un 60% ya sería muy difícil de explicar por azar.</p>
    ${go('predict', 'Ponerme a prueba')}` },

  // ---------- Opciones ----------
  { cat: 'Opciones', title: '¿Qué es una opción?', body: `
    <p>Un contrato que da el <b>derecho</b> (no la obligación) a comprar (<b>call</b>) o vender (<b>put</b>) un activo a un precio fijado (<b>strike</b>) hasta una fecha (<b>vencimiento</b>). Por ese derecho se paga una <b>prima</b>. Cada contrato suele cubrir 100 acciones.</p>
    <ul><li>Quien <b>compra</b> opciones paga la prima: riesgo limitado, necesita movimiento.</li><li>Quien <b>vende</b> cobra la prima: gana si no pasa mucho, pero asume el riesgo.</li></ul>
    ${go('options', 'Abrir el laboratorio de opciones')}` },
  { cat: 'Opciones', title: 'Las griegas', body: `
    <ul><li><b>Delta</b>: cuánto cambia el valor si el subyacente sube $1.</li><li><b>Gamma</b>: cuánto cambia el delta.</li><li><b>Theta</b>: cuánto valor se pierde (o gana) cada día que pasa.</li><li><b>Vega</b>: sensibilidad a la volatilidad implícita.</li></ul>` },
  { cat: 'Opciones', title: 'Volatilidad implícita', body: `
    <p>Es la volatilidad que el mercado “descuenta” en el precio de las opciones. Si la volatilidad <b>real</b> termina siendo mayor, ganan los compradores de opciones; si es menor, los vendedores. Pruébalo con el selector “Volatilidad real” del laboratorio.</p>` },
  { cat: 'Opciones', title: 'Estrategias con opciones', body: () => '<ul>' + Object.values(OPT_PRESETS).filter(p => p.legs).map(p => `<li><b>${p.name}</b> <span class="muted">(${p.view})</span>: ${p.desc}</li>`).join('') + '</ul>' + go('options', 'Probarlas') },

  // ---------- Psicología ----------
  { cat: 'Psicología y método', title: 'Errores psicológicos comunes', body: `
    <ul><li><b>FOMO</b>: entrar tarde por miedo a perderse el movimiento.</li><li><b>Revenge trading</b>: operar más grande para recuperar una pérdida.</li><li><b>Aversión a la pérdida</b>: cortar las ganancias pronto y dejar correr las pérdidas (justo al revés de lo correcto).</li><li><b>Exceso de confianza</b> tras una racha ganadora.</li></ul>` },
  { cat: 'Psicología y método', title: 'Checklist antes de cada operación', body: `
    <ul><li>¿Cuál es la tendencia? ¿Opero a favor o en contra?</li><li>¿Dónde queda invalidada mi idea? → ahí va el stop.</li><li>¿Cuál es mi objetivo? ¿El R:R es al menos 1:1.5?</li><li>¿Arriesgo 2% o menos?</li><li>¿Esta operación sigue mi plan o es un impulso?</li></ul>
    ${go('challenges', 'Ponerlo a prueba en “Disciplina de hierro”')}` }
];

const Learn = {
  init() {
    $('#learnSearch').addEventListener('input', () => this.render());
    $('#learnList').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) App.show(b.dataset.go); });
    this.render();
  },
  render() {
    const q = $('#learnSearch').value.trim().toLowerCase();
    let html = '', cat = null;
    for (const l of LESSONS) {
      const body = typeof l.body === 'function' ? l.body() : l.body;
      if (q && !(l.title + ' ' + body.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(q)) continue;
      if (l.cat !== cat) { cat = l.cat; html += `<div class="learn-cat">${cat}</div>`; }
      html += `<details class="lesson" ${q ? 'open' : ''}><summary>${l.title}</summary><div class="body">${body}</div></details>`;
    }
    $('#learnList').innerHTML = html || '<p class="muted">No hay resultados.</p>';
  }
};
