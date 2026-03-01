import {
  Circle,
  CircleChevronRight,
  CircleSlash,
  CircleMinus,
  CircleAlert,
  CircleHelp,
  CircleCheck,
} from 'lucide-react';

export function getStatusIcon(status: string | null | undefined) {
  switch ((status ?? '').trim().toLowerCase()) {
    case '':
    case ' ':
      return Circle;
    case 'x':
      return CircleCheck;
    case '/':
      return CircleSlash;
    case '-':
      return CircleMinus;
    case '>':
      return CircleChevronRight;
    case '!':
      return CircleAlert;
    case '?':
      return CircleHelp;
    default:
      return Circle;
  }
}
