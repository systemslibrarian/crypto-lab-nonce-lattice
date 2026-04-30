// Attack vs Defense panel for educational clarity

export function renderAttackVsDefensePanel() {
  return `
    <div class="attack-defense-panel">
      <div class="attack-path">
        <h3>Attack Path</h3>
        <ol>
          <li>Collect signatures</li>
          <li>Detect repeated <code>r</code> or leaked nonce bits</li>
          <li>Convert signatures into equations</li>
          <li>Build Hidden Number Problem</li>
          <li>Build lattice</li>
          <li>Run LLL/Babai</li>
          <li>Test candidate keys</li>
          <li>Verify against public key</li>
        </ol>
      </div>
      <div class="defense-path">
        <h3>Defense Path</h3>
        <ol>
          <li>Use RFC6979 or secure nonce generation</li>
          <li>Use reviewed crypto libraries</li>
          <li>Use constant-time scalar operations</li>
          <li>Avoid custom signing code</li>
          <li>Test for repeated <code>r</code></li>
          <li>Treat timing behavior as sensitive</li>
          <li>Keep signing keys away from browser demos</li>
        </ol>
      </div>
    </div>
  `;
}
