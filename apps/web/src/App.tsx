import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/admin/AdminLayout';
import { PageLayout } from './components/layout/PageLayout';
import { AdminRoute, ProtectedRoute } from './hooks/useAuth';
import AdminDedupReview from './pages/admin/AdminDedupReview';
import AdminEventForm from './pages/admin/AdminEventForm';
import AdminEvents from './pages/admin/AdminEvents';
import AdminSubmissions from './pages/admin/AdminSubmissions';
import AdminSyncStatus from './pages/admin/AdminSyncStatus';
import ArtistProfile from './pages/ArtistProfile';
import EventDetail from './pages/EventDetail';
import EventDiscovery from './pages/EventDiscovery';
import Home from './pages/Home';
import Login from './pages/Login';
import MyRaves from './pages/MyRaves';
import NotFound from './pages/NotFound';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Register from './pages/Register';
import SearchResults from './pages/SearchResults';
import SubmitEvent from './pages/SubmitEvent';
import VenueProfile from './pages/VenueProfile';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PageLayout />}>
        <Route index element={<Home />} />
        <Route path="events" element={<EventDiscovery />} />
        <Route path="events/:slug" element={<EventDetail />} />
        <Route path="search" element={<SearchResults />} />
        <Route path="artists/:slug" element={<ArtistProfile />} />
        <Route path="venues/:slug" element={<VenueProfile />} />
        <Route
          path="my-raves"
          element={
            <ProtectedRoute>
              <MyRaves />
            </ProtectedRoute>
          }
        />
        <Route
          path="submit"
          element={
            <ProtectedRoute>
              <SubmitEvent />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="events" replace />} />
        <Route path="events" element={<AdminEvents />} />
        <Route path="events/new" element={<AdminEventForm />} />
        <Route path="events/:id/edit" element={<AdminEventForm />} />
        <Route path="submissions" element={<AdminSubmissions />} />
        <Route path="dedup" element={<AdminDedupReview />} />
        <Route path="sync" element={<AdminSyncStatus />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
