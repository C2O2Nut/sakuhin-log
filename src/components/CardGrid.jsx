import { useStore } from '../store/useStore';
import CardItem from './CardItem';
import BulkBar from './BulkBar';

export default function CardGrid() {
  const { getFiltered, getSorted, currentLayout, currentFilter, currentTagFilter } = useStore();
  const filtered = getSorted(getFiltered());
  const compact = currentLayout === 'compact';

  if (filtered.length === 0) {
    const msg = currentTagFilter
      ? `#${currentTagFilter} の作品がありません`
      : currentFilter.size > 0
        ? `${[...currentFilter].join('・')}の作品がありません`
        : 'まだ作品がありません。「＋ 追加」から登録しよう！';
    return (
      <div style={{ textAlign:'center', padding:'80px 20px', color:'var(--ink3)' }}>
        <p style={{ fontSize:14, marginTop:12 }}>{msg}</p>
      </div>
    );
  }

  return (
    <>
      <BulkBar />
      <div style={{
        display:'grid',
        gridTemplateColumns: compact
          ? 'repeat(auto-fill, minmax(100px, 1fr))'
          : 'repeat(auto-fill, minmax(242px, 1fr))',
        gap: compact ? 8 : 18,
        padding: compact ? 14 : 24,
      }}>
        {filtered.map(item => (
          <CardItem key={item.id} item={item} compact={compact} />
        ))}
      </div>
    </>
  );
}
