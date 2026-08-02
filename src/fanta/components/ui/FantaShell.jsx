import '../../styles/fanta-system.css';

/*
 * FantaShell — contenitore di pagina FantaWalrus (pattern P1).
 *
 * Applica `.fw-root`, che è anche lo scope dei token `--fw-*`: tutto ciò che
 * usa il design system deve stare dentro una shell.
 *
 * Due archetipi (contratto §A.5 + decisione Eros 2026-08-03):
 *   narrow → 440px, flussi cliente (Entry, Team Builder, Picker, Home)
 *   wide   → 960px, dati e regia (Classifica, Matchday, VAR)
 */
export default function FantaShell({
  width = 'narrow',
  className = '',
  children,
  ...rest
}) {
  const classes = ['fw-root', `fw-shell--${width}`, className].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
