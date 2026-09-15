import { PROCESSING_LABELS, type ProcessingPhase } from "./processing";
import styles from "./styles.module.less";
import activeStyles from "./activeText.module.less";

export function WorkingStatus({ phase, active }: {
  phase: ProcessingPhase; active: boolean;
}) {
  return <div className={styles.working} role="status" data-processing-phase={phase}>
    <span className={active ? activeStyles.text : undefined}>{PROCESSING_LABELS[phase]}</span>
  </div>;
}
