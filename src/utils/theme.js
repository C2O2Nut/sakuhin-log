export const PRESETS = {
  デフォルト: { bg:'#f5f0e8', surface:'#fdfaf4', surface2:'#ede8dc', ink:'#1a1612', ink2:'#5a5248', ink3:'#9a9088', accent:'#c94a2a', accent2:'#2a6e8c', border:'#d0c8b8' },
  ダーク:     { bg:'#1a1a1a', surface:'#242424', surface2:'#2e2e2e', ink:'#e8e4dc', ink2:'#a8a09a', ink3:'#6a6460', accent:'#e06040', accent2:'#4a9aba', border:'#3a3a3a' },
  ミント:     { bg:'#e8f5f0', surface:'#f4fdf9', surface2:'#d8ede6', ink:'#1a2e28', ink2:'#3a5a50', ink3:'#7a9a92', accent:'#2a8c6a', accent2:'#1a6a8c', border:'#c0ddd6' },
  ネイビー:   { bg:'#e8eef5', surface:'#f4f8fd', surface2:'#d8e4ee', ink:'#1a2232', ink2:'#3a4a62', ink3:'#7a8aaa', accent:'#2a4a8c', accent2:'#8c2a4a', border:'#c0cede' },
  セピア:     { bg:'#f5ede0', surface:'#fdf6ec', surface2:'#ede0cc', ink:'#3a2810', ink2:'#6a4a28', ink3:'#9a8060', accent:'#8c5a1a', accent2:'#2a5a3a', border:'#d0b890' },
  ピンク:     { bg:'#fdf0f5', surface:'#fff5f9', surface2:'#f0e0ea', ink:'#2e1420', ink2:'#5a3448', ink3:'#9a7a88', accent:'#c94a7a', accent2:'#8c2a5a', border:'#e0c0ce' },
};

export function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, val]) => {
    root.style.setProperty(`--${key}`, val);
    // shadow は bg から自動生成
  });
  // shadow
  const r = parseInt(theme.ink.slice(1,3),16);
  const g = parseInt(theme.ink.slice(3,5),16);
  const b = parseInt(theme.ink.slice(5,7),16);
  root.style.setProperty('--shadow', `rgba(${r},${g},${b},0.12)`);
}
