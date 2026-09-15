import styles from "./StatusPill.module.css";

type Props = {
  kind: string;
  label: string;
};

export function StatusPill({ kind, label }: Props) {
  const className = `${styles.pill} ${styles[kind as keyof typeof styles] ?? ""}`;
  return <span className={className}>{label}</span>;
}
