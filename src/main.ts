import './style.css';
import { startDemo } from './demo3d';

const app = document.getElementById('app')!;
startDemo(app);
const label = document.createElement('div');
label.className = 'label';
label.innerHTML = '<b>БРАНДМАУЭР</b><span>образец 3D-стиля · крути пальцем</span>';
document.body.appendChild(label);
