import './ui/theme.css';
import { App } from './app/App';
import { newEstate, rectBoundary } from './core/estate';

const root = document.getElementById('app')!;
const doc = newEstate('My Estate', rectBoundary(400, 400));
const app = new App(root, doc);
app.start();
(window as any).app = app;
document.getElementById('boot')?.classList.add('hide');
