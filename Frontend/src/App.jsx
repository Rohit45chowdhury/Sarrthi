import React from 'react'
import { Route, Routes } from 'react-router-dom'

import Start from './pages/Start'

import UserLogin from './pages/UserLogin'
import UserSignup from './pages/UserSignup'

import Captainlogin from './pages/Captainlogin'
import CaptainSignup from './pages/CaptainSignup'

import Home from './pages/Home'
import UserProtectWrapper from './pages/UserProtectWrapper'
import UserLogout from './pages/UserLogout'

import CaptainHome from './pages/CaptainHome'
import CaptainProtectWrapper from './pages/CaptainProtectWrapper'
import CaptainLogout from './pages/CaptainLogout'

import Riding from './pages/Riding'
import CaptainRiding from './pages/CaptainRiding'

import RideEndRating from './components/RideEndRating'

import 'remixicon/fonts/remixicon.css'
import 'leaflet/dist/leaflet.css'

const App = () => {

  return (
    <div>

      <Routes>

        {/* Start */}
        <Route
          path="/"
          element={<Start />}
        />

        {/* User Routes */}
        <Route
          path="/login"
          element={<UserLogin />}
        />

        <Route
          path="/signup"
          element={<UserSignup />}
        />

        <Route
          path="/home"
          element={
            <UserProtectWrapper>
              <Home />
            </UserProtectWrapper>
          }
        />

        <Route
          path="/user/logout"
          element={
            <UserProtectWrapper>
              <UserLogout />
            </UserProtectWrapper>
          }
        />

        <Route
          path="/riding"
          element={
            <UserProtectWrapper>
              <Riding />
            </UserProtectWrapper>
          }
        />

        {/* Captain Routes */}
        <Route
          path="/captain-login"
          element={<Captainlogin />}
        />

        <Route
          path="/captain-signup"
          element={<CaptainSignup />}
        />

        <Route
          path="/captain-home"
          element={
            <CaptainProtectWrapper>
              <CaptainHome />
            </CaptainProtectWrapper>
          }
        />

        <Route
          path="/captain/logout"
          element={
            <CaptainProtectWrapper>
              <CaptainLogout />
            </CaptainProtectWrapper>
          }
        />

        <Route
          path="/captain-riding"
          element={<CaptainRiding />}
        />

      </Routes>

      {/* Global: user ko rating popup kisi bhi page par dikhega */}
      <RideEndRating />

    </div>
  )
}

export default App