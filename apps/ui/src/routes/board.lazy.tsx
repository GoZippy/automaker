import { createLazyFileRoute } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view';

export const Route = createLazyFileRoute('/board')({
  component: BoardView,
});
