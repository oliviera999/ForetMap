/**
 * Icônes du chrome d'interface (audit homogénéité UI, D-2) — jeu unique construit sur
 * lucide-react (https://github.com/lucide-icons/lucide, licence ISC), rendu identique sur
 * tous les appareils. Les emojis restent réservés au CONTENU métier (zones, plantes,
 * repères, mascottes, badges…), jamais au chrome (onglets, barres d'outils, actions).
 *
 * Point d'import unique : les composants n'importent JAMAIS lucide-react directement —
 * ajouter ici toute nouvelle icône (taille 18, trait 2, aria-hidden par défaut ;
 * surchargables par props). `.ui-icon` (shared-controls.css) règle l'alignement vertical.
 */
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  BoxSelect,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Compass,
  Copy,
  CopyCheck,
  Filter,
  Folders,
  GraduationCap,
  Hand,
  HelpCircle,
  Images,
  Info,
  KeyRound,
  LayoutGrid,
  LineChart,
  Lock,
  LocateFixed,
  LogOut,
  Magnet,
  Map as MapGlyph,
  MapPin,
  Maximize2,
  MessagesSquare,
  Minus,
  Network,
  NotebookPen,
  Palette,
  Pencil,
  PenLine,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Scan,
  ScrollText,
  Settings,
  Settings2,
  SignalLow,
  SlidersHorizontal,
  Sprout,
  Tags,
  Trash2,
  TriangleAlert,
  Undo2,
  Unlock,
  Users,
  X,
  Zap,
} from 'lucide-react';

/** Fabrique d'icône chrome : défauts communs, surchargables par props. */
const ui = (LucideIcon) => {
  function UiIcon({ size = 18, className = '', ...rest }) {
    return (
      <LucideIcon
        size={size}
        strokeWidth={2}
        aria-hidden="true"
        focusable="false"
        className={`ui-icon ${className}`.trim()}
        {...rest}
      />
    );
  }
  UiIcon.displayName = `Ui${LucideIcon.displayName || LucideIcon.name || 'Icon'}`;
  return UiIcon;
};

/* Navigation (onglets, pôles) */
export const IconMap = ui(MapGlyph);
export const IconTasks = ui(ClipboardList);
export const IconBiodiv = ui(Sprout);
export const IconQuiz = ui(HelpCircle);
export const IconGlossary = ui(BookOpen);
export const IconFoodweb = ui(Network);
export const IconTuto = ui(BookMarked);
export const IconForum = ui(MessagesSquare);
export const IconStats = ui(BarChart3);
export const IconVisit = ui(Compass);
export const IconMascotPacks = ui(Palette);
export const IconMediaLibrary = ui(Folders);
export const IconProfiles = ui(Users);
export const IconSettings = ui(Settings);
export const IconAudit = ui(ScrollText);
export const IconAbout = ui(Info);
export const IconNotebook = ui(NotebookPen);
export const IconPoleContents = ui(LayoutGrid);
export const IconPoleTracking = ui(LineChart);
export const IconPoleAdmin = ui(Settings2);

/* Actions et barres d'outils */
export const IconHand = ui(Hand);
export const IconDrawZone = ui(PenLine);
export const IconMarker = ui(MapPin);
export const IconCheck = ui(Check);
export const IconUndo = ui(Undo2);
export const IconClose = ui(X);
export const IconSave = ui(Save);
export const IconFullscreen = ui(Maximize2);
export const IconLock = ui(Lock);
export const IconUnlock = ui(Unlock);
export const IconGps = ui(LocateFixed);
export const IconLabels = ui(Tags);
export const IconZoomIn = ui(Plus);
export const IconZoomOut = ui(Minus);
export const IconZoomReset = ui(Scan);
export const IconEdit = ui(Pencil);
export const IconDuplicate = ui(Copy);
export const IconArchive = ui(Archive);
export const IconUnarchive = ui(ArchiveRestore);
export const IconDelete = ui(Trash2);
export const IconReports = ui(ClipboardList);
export const IconQuickAssign = ui(Zap);
export const IconGroup = ui(Users);
export const IconRestore = ui(RefreshCw);
export const IconGallery = ui(Images);
export const IconCamera = ui(Camera);
export const IconMultiOn = ui(CopyCheck);
export const IconMultiOff = ui(BoxSelect);
export const IconMagnet = ui(Magnet);
export const IconTarget = ui(Circle);
export const IconSlider = ui(SlidersHorizontal);
export const IconFilter = ui(Filter);
export const IconChevronDown = ui(ChevronDown);
export const IconChevronRight = ui(ChevronRight);
export const IconBell = ui(Bell);
export const IconStudentView = ui(GraduationCap);
export const IconTeacherView = ui(Presentation);
export const IconKey = ui(KeyRound);
export const IconLogout = ui(LogOut);
export const IconWarning = ui(TriangleAlert);
export const IconSignalLow = ui(SignalLow);
