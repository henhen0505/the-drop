import styles from './RaveStateTabs.module.css';

export type RaveTab = 'all' | 'interested' | 'going' | 'have_ticket' | 'past';

const TABS: { key: RaveTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'interested', label: 'Interested' },
  { key: 'going', label: 'Going' },
  { key: 'have_ticket', label: 'Have Ticket' },
  { key: 'past', label: 'Past' },
];

interface RaveStateTabsProps {
  activeTab: RaveTab;
  onTabChange: (tab: RaveTab) => void;
}

export function RaveStateTabs({ activeTab, onTabChange }: RaveStateTabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`${styles.tab} ${activeTab === tab.key ? styles.active : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
