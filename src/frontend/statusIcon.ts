export function getStatusIcon(status: string | null | undefined): string {
  switch ((status ?? '').trim().toLowerCase()) {
    case '':
    case ' ':
      return 'circle';
    case 'x':
      return 'circle-check';
    case '/':
      return 'circle-slash';
    case '-':
      return 'circle-minus';
    case '>':
      return 'circle-chevron-right';
    case '!':
      return 'circle-alert';
    case '?':
      return 'circle-help';
    default:
      return 'circle';
  }
}
