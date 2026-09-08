import './styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Elemento #app não encontrado.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">NFe Agendamento 2.0</p>
        <h1>Consultar NF-e</h1>
        <p class="subtitle">Consulta direta usando o certificado A1 deste computador.</p>
      </div>
      <div class="bridge-pill" id="bridge-status" data-state="checking">
        <span class="bridge-dot" aria-hidden="true"></span>
        <span>Verificando Bridge…</span>
      </div>
    </header>

    <section class="lookup-card" aria-labelledby="lookup-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Consulta</p>
          <h2 id="lookup-title">Chave de acesso</h2>
        </div>
        <span class="key-hint">44 dígitos</span>
      </div>

      <form id="lookup-form" novalidate>
        <label for="access-key">Chave da NF-e</label>
        <div class="lookup-row">
          <input
            id="access-key"
            name="accessKey"
            inputmode="numeric"
            autocomplete="off"
            maxlength="44"
            placeholder="Digite ou cole a chave de acesso"
            aria-describedby="lookup-help"
          />
          <button type="submit">Consultar</button>
        </div>
        <p id="lookup-help" class="help-text">O processamento visual acontece neste site. O Bridge local é usado apenas quando o navegador precisa acessar certificado, SEFAZ ou Portal.</p>
      </form>
    </section>

    <section class="result-card" id="result" aria-live="polite">
      <div class="empty-state">
        <strong>Nenhuma NF-e carregada</strong>
        <span>Informe uma chave para iniciar.</span>
      </div>
    </section>
  </div>
`;
