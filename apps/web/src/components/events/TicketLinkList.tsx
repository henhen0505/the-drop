import type { TicketLink } from '@the-drop/types';
import { formatPriceRange } from '../../utils/format';
import styles from './TicketLinkList.module.css';

interface TicketLinkListProps {
  ticketLinks: TicketLink[];
}

export function TicketLinkList({ ticketLinks }: TicketLinkListProps) {
  if (ticketLinks.length === 0) {
    return <p className={styles.empty}>No ticket links available yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {ticketLinks.map((link) => (
        <li key={link.id} className={styles.item}>
          <div className={styles.header}>
            <span className={styles.vendor}>{link.vendorName}</span>
            <span className={styles.badge}>{link.vendorClassification.replace('_', ' ')}</span>
          </div>
          {link.ticketType && <p className={styles.ticketType}>{link.ticketType}</p>}
          <p className={styles.price}>
            {formatPriceRange(link.priceMinCents, link.priceMaxCents)}
            {!link.feesKnown && <span className={styles.fees}> (+ fees)</span>}
          </p>
          <a
            href={link.affiliateUrl ?? link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.cta}
          >
            Buy Tickets
          </a>
          {link.ftcDisclosure && <p className={styles.disclosure}>{link.ftcDisclosure}</p>}
        </li>
      ))}
    </ul>
  );
}
