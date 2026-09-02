import ReactDOM from 'react-dom/client';
import './index.css';
import MascotPackToolView from './components/MascotPackToolView.jsx';
import { AppDialogsProvider } from './shared/components/AppDialogsProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppDialogsProvider>
    <MascotPackToolView />
  </AppDialogsProvider>,
);
