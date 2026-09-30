
import React, { useEffect, useState } from 'react'
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
})


// Recenter map when location changes
const RecenterMap = ({ position }) => {

    const map = useMap()

    useEffect(() => {

        if (position) {
            map.setView(position, 15)
        }

    }, [position, map])

    return null
}


const LiveTracking = () => {

    const [currentPosition, setCurrentPosition] = useState(null)

    useEffect(() => {

        if (!navigator.geolocation) {
            console.error('Geolocation is not supported')
            return
        }

        // Get current location
        navigator.geolocation.getCurrentPosition(

            (position) => {

                const { latitude, longitude } = position.coords

                console.log(
                    'Position updated:',
                    latitude,
                    longitude
                )

                setCurrentPosition([
                    latitude,
                    longitude
                ])
            },

            (error) => {
                console.error(
                    'Geolocation error:',
                    error.message
                )
            },

            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        )


        // Track location
        const watchId = navigator.geolocation.watchPosition(

            (position) => {

                const { latitude, longitude } = position.coords

                console.log(
                    'Position updated:',
                    latitude,
                    longitude
                )

                setCurrentPosition([
                    latitude,
                    longitude
                ])
            },

            (error) => {
                console.error(
                    'Location tracking error:',
                    error.message
                )
            },

            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        )


        return () => {
            navigator.geolocation.clearWatch(watchId)
        }

    }, [])


    if (!currentPosition) {
        return (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-gray-100">
                <p className="text-gray-600">
                    Getting your location...
                </p>
            </div>
        )
    }


    return (
        <div className="absolute inset-0 z-0">

            <MapContainer
                center={currentPosition}
                zoom={15}
                scrollWheelZoom={true}
                className="w-full h-full"
            >

                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <RecenterMap
                    position={currentPosition}
                />

                <Marker
                    position={currentPosition}
                >
                    <Popup>
                        You are here
                    </Popup>
                </Marker>

            </MapContainer>

        </div>
    )
}

export default LiveTracking

