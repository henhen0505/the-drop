import { useNavigate } from 'react-router-dom';
import type { UserEventState } from '@the-drop/types';
import { useAuth } from '../../hooks/useAuth';
import { useEventState } from '../../hooks/useEventState';
import styles from './EventStateToggle.module.css';

interface EventStateToggleProps {
  eventId: string;
}

const OPTIONS: { state: UserEventState; label: string }[] = [
  { state: 'INTERESTED', label: 'Interested' },
  { state: 'GOING', label: 'Going' },
  { state: 'HAVE_TICKET', label: 'Have Ticket' },
];

export function EventStateToggle({ eventId }: EventStateToggleProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { currentState, setState, clearState, isPending, isError } = useEventState(eventId);

  function handleClick(state: UserEventState) {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (currentState === state) {
      clearState();
    } else {
      setState(state);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.buttons}>
        {OPTIONS.map((option) => (
          <button
            key={option.state}
            type="button"
            className={`${styles.button} ${currentState === option.state ? styles.active : ''}`}
            aria-pressed={currentState === option.state}
            onClick={() => handleClick(option.state)}
            disabled={isPending}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!isAuthenticated && <p className={styles.hint}>Log in to save events</p>}
      {isError && <p className={styles.error}>Couldn&apos;t save. Try again.</p>}
    </div>
  );
}
