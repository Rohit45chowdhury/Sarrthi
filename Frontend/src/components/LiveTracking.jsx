import React, { useEffect, useMemo, useState } from 'react'

import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap
} from 'react-leaflet'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'


// ================= FIX LEAFLET ICON =================

delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',

    iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',

    shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
})


// ================= CUSTOM CAPTAIN ICON =================

const captainIcon = new L.DivIcon({
    className: 'captain-live-marker',

    html: `
        <div style="
            width: 44px;
            height: 44px;
            background: #12334A;
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            color: white;
            font-size: 22px;
        ">
            🚗
        </div>
    `,

    iconSize: [44, 44],
    iconAnchor: [22, 22]
})


// ================= MAP CONTROLLER =================
// Depends on plain numbers (not an array), so the effect runs only when the
// position really changes. panTo keeps the user's current zoom level.

const MapController = ({ target }) => {

    const map = useMap()

    const lat = target?.[0]
    const lng = target?.[1]

    useEffect(() => {

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        map.panTo([lat, lng], {
            animate: true,
            duration: 0.5
        })

    }, [lat, lng, map])

    return null
}


// ================= LIVE TRACKING =================

const LiveTracking = ({ captainLocation = null }) => {

    const [currentPosition, setCurrentPosition] = useState(null)

    const [error, setError] = useState('')


    // ================= GET LIVE GPS =================

    useEffect(() => {

        if (!navigator.geolocation) {

            setError('Geolocation is not supported by your browser.')

            return
        }

        const watchId = navigator.geolocation.watchPosition(

            (position) => {

                const { latitude, longitude } = position.coords

                setCurrentPosition([latitude, longitude])

                setError('')
            },

            (err) => {

                console.error('GPS Error:', err.message)

                switch (err.code) {

                    case 1:
                        setError('Location permission denied. Please allow location access.')
                        break

                    case 2:
                        setError('Location information is unavailable.')
                        break

                    case 3:
                        setError('Location request timed out.')
                        break

                    default:
                        setError('Unable to get your location.')
                }
            },

            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 20000
            }
        )

        return () => {

            navigator.geolocation.clearWatch(watchId)

        }

    }, [])


    // ================= VALIDATE CAPTAIN LOCATION =================

    const capLat = Number(captainLocation?.[0])
    const capLng = Number(captainLocation?.[1])

    // useMemo -> same array reference until the numbers change
    const validCaptainLocation = useMemo(
        () =>
            Number.isFinite(capLat) && Number.isFinite(capLng)
                ? [capLat, capLng]
                : null,
        [capLat, capLng]
    )

    // User side can use Captain location as initial map center
    const mapCenter = validCaptainLocation || currentPosition


    // ================= LOADING =================

    if (!mapCenter) {

        return (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-5">

                <div className="text-center">

                    <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-[#F15A24]" />

                    <p className="font-medium text-[#12334A]">
                        Getting live location...
                    </p>

                    {error && (
                        <p className="mt-2 text-sm text-red-500">
                            {error}
                        </p>
                    )}

                </div>

            </div>
        )
    }


    // ================= MAP =================

    return (

        <div className="absolute inset-0 z-0 h-full w-full">

            <MapContainer
                center={mapCenter}
                zoom={16}
                scrollWheelZoom={true}
                zoomControl={false}
                className="h-full w-full"
            >

                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />


                <MapController target={mapCenter} />


                {/* USER CURRENT LOCATION */}

                {currentPosition && (

                    <Marker position={currentPosition}>

                        <Popup>

                            <div className="text-center">

                                <strong>Your Location</strong>

                                <br />

                                You are here.

                            </div>

                        </Popup>

                    </Marker>

                )}


                {/* CAPTAIN LIVE LOCATION */}

                {validCaptainLocation && (

                    <Marker
                        position={validCaptainLocation}
                        icon={captainIcon}
                    >

                        <Popup>

                            <div className="text-center">

                                <strong>Saarthi Captain</strong>

                                <br />

                                Live location

                            </div>

                        </Popup>

                    </Marker>

                )}

            </MapContainer>

        </div>
    )
}

export default LiveTracking