import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, AccountDeletedError } from './services/api';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { RT_PROF_TOOLTIPS } from './constants/realtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Toast,
  TasksView,
  PlantManager,
  PlantViewer,
  ObservationNotebook,
} from './components/foretmap-views';
import { MapView } from './components/map-views';
import { AuthScreen, PinModal } from './components/auth-views';
import { StudentProfileEditor, StudentStats, TeacherStats } from './components/stats-views';
import { AuditLog } from './components/audit-views';
import { AboutView } from './components/about-views';
import { StudentAvatar } from './components/student-avatar';
import { TutorialsView } from './components/tutorials-views';

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const DEFAULT_MAPS = useMemo(() => ([
    { id: 'foret', label: 'Forêt comestible', map_image_url: '/map.png', sort_order: 1 },
    { id: 'n3', label: 'N3', map_image_url: '/maps/plan%20n3.jpg', sort_order: 2 },
  ]), []);
  const [student,    setStudent]    = useState(null);
  const [isTeacher,  setIsTeacher]  = useState(() => !!localStorage.getItem('foretmap_teacher_token'));
  const [showPin,    setShowPin]    = useState(false);
  const [showStats,  setShowStats]  = useState(false);
  const [showProfile,setShowProfile]= useState(false);
  const [tab,        setTab]        = useState('map');
  const [maps,       setMaps]       = useState(DEFAULT_MAPS);
  const [activeMapId, setActiveMapId] = useState(() => localStorage.getItem('foretmap_active_map') || 'foret');
  const [zones,      setZones]      = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [plants,     setPlants]     = useState([]);
  const [tutorials,  setTutorials]  = useState([]);
  const [markers,    setMarkers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [refreshMs,  setRefreshMs]  = useState(30000);
  const [serverDown, setServerDown] = useState(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('foretmap_active_map', activeMapId);
  }, [activeMapId]);

  useEffect(() => {
    api('/api/version').then(d => setAppVersion(d.version)).catch(err => {
      console.error('[ForetMap] version app', err);
    });
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('foretmap_sw_updated') === '1') {
        sessionStorage.removeItem('foretmap_sw_updated');
        setToast('Nouvelle version installée.');
      }
    } catch (_) {}
  }, []);

  // Called from anywhere when a 401-deleted is detected
  const forceLogout = useCallback(() => {
    localStorage.removeItem('foretmap_student');
    localStorage.removeItem('foretmap_teacher_token');
    setStudent(null);
    setIsTeacher(false);
    setToast('Votre compte a été supprimé par le professeur.');
  }, []);

  const updateStudentSession = useCallback((nextStudent) => {
    setStudent(nextStudent);
    localStorage.setItem('foretmap_student', JSON.stringify(nextStudent));
  }, []);

  // Restore session — validates against server on load
  useEffect(() => {
    const saved = localStorage.getItem('foretmap_student');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setStudent(s); // show app immediately with cached data
        api('/api/students/register', 'POST', { studentId: s.id })
          .then(fresh => updateStudentSession(fresh))
          .catch(err => {
            if (err instanceof AccountDeletedError || err.deleted) forceLogout();
            else console.error('[ForetMap] validation session élève', err);
          });
      } catch (e) { console.error('[ForetMap] lecture session locale', e); }
    }
  }, [forceLogout, updateStudentSession]);

  useEffect(() => {
    const onExpired = () => { setIsTeacher(false); setToast('Session professeur expirée.'); };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const mapQuery = `map_id=${encodeURIComponent(activeMapId)}`;
      const [mapsRes, z, t, p, m, tu] = await Promise.all([
        api('/api/maps').catch(() => DEFAULT_MAPS),
        api(`/api/zones?${mapQuery}`),
        api('/api/tasks'),
        api('/api/plants'),
        api(`/api/map/markers?${mapQuery}`),
        api('/api/tutorials'),
      ]);
      const safeMaps = Array.isArray(mapsRes) && mapsRes.length > 0 ? mapsRes : DEFAULT_MAPS;
      setMaps(safeMaps);
      if (!safeMaps.some(mp => mp.id === activeMapId)) {
        setActiveMapId(safeMaps[0].id);
      }
      setZones(z); setTasks(t); setPlants(p); setMarkers(m); setTutorials(tu);
      failCountRef.current = 0;
      setRefreshMs(30000);
      setServerDown(false);
    } catch(e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else {
        console.error(e);
        const isServerSide = e.status == null || e.status >= 500;
        if (isServerSide) {
          failCountRef.current += 1;
          if (failCountRef.current >= 3) {
            setServerDown(true);
            setRefreshMs(120000);
          }
        }
      }
    }
    setLoading(false);
  }, [activeMapId, DEFAULT_MAPS, forceLogout]);

  const tasksForActiveMap = useMemo(() => (
    tasks.filter((t) => {
      const effectiveMapId = t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
      return effectiveMapId === activeMapId || effectiveMapId == null;
    })
  ), [tasks, activeMapId]);

  const rtStatus = useForetmapRealtime({
    student,
    fetchAll,
    forceLogout,
    activeMapId,
    setTasks,
    setZones,
    setPlants,
    setMarkers,
  });

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh (30 s ; 2 min après 3 échecs serveur consécutifs)
  useEffect(() => {
    const id = setInterval(fetchAll, refreshMs);
    return () => clearInterval(id);
  }, [fetchAll, refreshMs]);

  const updateZone = async (id, data) => {
    await api(`/api/zones/${id}`, 'PUT', data);
    await fetchAll();
  };

  if (!student) return (
    <>
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      <AuthScreen onLogin={s => updateStudentSession(s)} appVersion={appVersion}/>
    </>
  );
  if (loading) return (
    <div className="loader">
      <div className="loader-leaf">🌿</div>
      <p>Chargement de la forêt...</p>
    </div>
  );

  return (
    <div id="app">
      {serverDown && (
        <div className="fade-in" role="alert" style={{
          margin:'8px 12px 0', padding:'10px 14px', borderRadius:12,
          background:'#fef3c7', border:'1px solid #f59e0b', color:'#78350f', fontSize:'.9rem'
        }}>
          <strong>Serveur indisponible.</strong> Nouvel essai automatique toutes les 2 minutes.
          <button type="button" className="btn btn-sm" style={{marginLeft:10, verticalAlign:'middle'}}
            onClick={() => { failCountRef.current = 0; setRefreshMs(30000); setServerDown(false); fetchAll(); }}>
            Réessayer maintenant
          </button>
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {showPin && <PinModal
        onSuccess={() => { setIsTeacher(true); setShowPin(false); setToast('Mode professeur activé 🔓'); }}
        onClose={() => setShowPin(false)}
      />}
      {showStats && !isTeacher && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStats(false)}>
          <div className="log-modal fade-in" style={{maxHeight:'88vh'}}>
            <button className="modal-close" onClick={() => setShowStats(false)}>✕</button>
            <StudentStats student={student}/>
          </div>
        </div>
      )}
      {showProfile && !isTeacher && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowProfile(false)}>
          <div className="log-modal fade-in" style={{maxHeight:'88vh'}}>
            <button className="modal-close" onClick={() => setShowProfile(false)}>✕</button>
            <StudentProfileEditor
              student={student}
              onUpdated={updateStudentSession}
              onClose={() => setShowProfile(false)}
            />
          </div>
        </div>
      )}

      <header>
        <div className="logo">
          <span>🌿</span> ForêtMap
        </div>
        <div className="header-right">
          <span
            className="app-version-badge"
            title={`Version installée: ${appVersion != null ? appVersion : 'chargement...'}`}
            aria-label={`Version ${appVersion != null ? appVersion : 'en chargement'}`}
          >
            <span className="app-version-badge__version">v{appVersion != null ? appVersion : '…'}</span>
            <span className="app-version-badge__status">à jour</span>
          </span>
          {isTeacher && rtStatus !== 'off' && (
            <span
              className="realtime-prof-wrap"
              title={RT_PROF_TOOLTIPS[rtStatus] || ''}
              aria-label={RT_PROF_TOOLTIPS[rtStatus] || 'État du temps réel'}
              role="status"
            >
              <span className={`realtime-dot realtime-dot--${rtStatus}`} aria-hidden />
            </span>
          )}
          <button
            className="user-badge"
            onClick={() => !isTeacher && setShowStats(true)}
            style={{ cursor: isTeacher ? 'default' : 'pointer' }}
            title={isTeacher ? '' : 'Voir mes statistiques'}
          >
            {!isTeacher && <StudentAvatar student={student} size={20} style={{ border: 'none' }} />}
            <span className="user-badge-text">{student.pseudo || `${student.first_name} ${student.last_name}`}</span>
          </button>
          {!isTeacher && (
            <button
              className="lock-btn"
              title="Modifier mon profil"
              onClick={() => setShowProfile(true)}
            >
              ✏️
            </button>
          )}
          <button className={`lock-btn ${isTeacher ? 'active' : ''}`} onClick={() => {
            if (isTeacher) { setIsTeacher(false); localStorage.removeItem('foretmap_teacher_token'); setToast('Mode élève'); }
            else setShowPin(true);
          }}>
            {isTeacher ? <>🔓 <span className="lock-label">Prof</span></> : '🔒'}
          </button>
          <button className="lock-btn" title="Déconnexion" onClick={() => {
            localStorage.removeItem('foretmap_student');
            localStorage.removeItem('foretmap_teacher_token');
            setStudent(null); setIsTeacher(false);
          }}>↩️</button>
        </div>
      </header>

      {isTeacher ? (
        <div className="main teacher-main">
          <div className="top-tabs">
            <button className={`top-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>🗺️ Carte & Zones</button>
            <button className={`top-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              ✅ Tâches {tasksForActiveMap.filter(t => t.status === 'done').length > 0 && `(${tasksForActiveMap.filter(t => t.status === 'done').length} à valider)`}
            </button>
            <button className={`top-tab ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>🌱 Biodiversité</button>
            <button className={`top-tab ${tab === 'tuto' ? 'active' : ''}`} onClick={() => setTab('tuto')}>📘 Tuto</button>
            <button className={`top-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
            <button className={`top-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>📜 Audit</button>
            <button className={`top-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>ℹ️ À propos</button>
          </div>
          {tab === 'map'    && <MapView zones={zones} markers={markers} tasks={tasks} plants={plants} maps={maps} activeMapId={activeMapId} onMapChange={setActiveMapId} isTeacher student={student} onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
          {tab === 'tasks'  && <TasksView  tasks={tasks} zones={zones} markers={markers} maps={maps} tutorials={tutorials} activeMapId={activeMapId} isTeacher student={student} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
          {tab === 'plants' && <PlantManager plants={plants} onRefresh={fetchAll}/>}
          {tab === 'tuto'   && <TutorialsView tutorials={tutorials} isTeacher onRefresh={fetchAll} onForceLogout={forceLogout} />}
          {tab === 'stats'  && <TeacherStats/>}
          {tab === 'audit'  && <AuditLog/>}
          {tab === 'about'  && <AboutView appVersion={appVersion}/>}
        </div>
      ) : (
        <>
          <div className="main">
            {tab === 'map'    && <MapView zones={zones} markers={markers} tasks={tasks} plants={plants} maps={maps} activeMapId={activeMapId} onMapChange={setActiveMapId} isTeacher={false} student={student} onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
            {tab === 'tasks'  && <TasksView tasks={tasks} zones={zones} markers={markers} maps={maps} tutorials={tutorials} activeMapId={activeMapId} isTeacher={false} student={student} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
            {tab === 'plants' && <PlantViewer plants={plants} zones={zones}/>}
            {tab === 'tuto' && <TutorialsView tutorials={tutorials} isTeacher={false} onRefresh={fetchAll} onForceLogout={forceLogout} />}
            {tab === 'notebook' && <ObservationNotebook student={student} zones={zones}/>}
            {tab === 'about' && <AboutView appVersion={appVersion}/>}
          </div>
          <nav className="bottom-nav">
            <button className={`nav-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
              <span className="nav-icon">🗺️</span> Carte
            </button>
            <button className={`nav-btn ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              <span className="nav-icon">✅</span>
              Tâches {tasksForActiveMap.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length > 0
                && `(${tasksForActiveMap.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length})`}
            </button>
            <button className={`nav-btn ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>
              <span className="nav-icon">🌱</span> Biodiversité
            </button>
            <button className={`nav-btn ${tab === 'tuto' ? 'active' : ''}`} onClick={() => setTab('tuto')}>
              <span className="nav-icon">📘</span> Tuto
            </button>
            <button className={`nav-btn ${tab === 'notebook' ? 'active' : ''}`} onClick={() => setTab('notebook')}>
              <span className="nav-icon">📓</span> Carnet
            </button>
            <button className={`nav-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
              <span className="nav-icon">ℹ️</span> À propos
            </button>
          </nav>
        </>
      )}
      <footer className="app-footer">Version {appVersion != null ? appVersion : '…'}</footer>
    </div>
  );
}


export { App };
