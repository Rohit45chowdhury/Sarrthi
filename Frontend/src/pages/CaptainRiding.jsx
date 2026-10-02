import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import FinishRide from '../components/FinishRide'
import LiveTracking from '../components/LiveTracking'

// sessionStorage keeps the ride alive after a page refresh
const readStoredRide = () => {
    try {
        return JSON.parse(sessionStorage.getItem('activeRide') || 'null')
    } catch {
        return null
    }
}

const CaptainRiding = () => {

    const location = useLocation()
    const navigate = useNavigate()

    const [finishRidePanel, setFinishRidePanel] = useState(false)
    const finishRidePanelRef = useRef(null)

    // ride comes from navigate('/captain-riding', { state: { ride } })
    const [rideData] = useState(
        () => location.state?.ride || readStoredRide()
    )

    useEffect(() => {
        if (rideData) {
            sessionStorage.setItem('activeRide', JSON.stringify(rideData))
        }
    }, [rideData])

    // ==========================================
    // FINISH RIDE PANEL ANIMATION
    // ==========================================

    useGSAP(() => {

        if (!finishRidePanelRef.current) return

        gsap.to(finishRidePanelRef.current, {
            y: finishRidePanel ? 0 : '100%',
            duration: 0.4,
            ease: finishRidePanel ? 'power3.out' : 'power3.inOut'
        })

    }, [finishRidePanel, rideData])

    // ==========================================
    // NO ACTIVE RIDE
    // ==========================================

    if (!rideData) {

        return (
            <div className='h-screen w-full flex items-center justify-center p-5'>

                <div className='text-center'>

                    <i className='ri-error-warning-line text-5xl text-red-500'></i>

                    <h2 className='text-xl font-bold mt-3'>
                        No active ride
                    </h2>

                    <p className='text-gray-500 mt-2'>
                        Accept a ride and enter the OTP to start one.
                    </p>

                    <button
                        type='button'
                        onClick={() => navigate('/captain-home')}
                        className='mt-5 bg-black text-white px-6 py-3 rounded-lg'
                    >
                        Back to Home
                    </button>

                </div>

            </div>
        )
    }

    const distanceKm =
        rideData?.distance != null &&
        Number.isFinite(Number(rideData.distance))
            ? (Number(rideData.distance) / 1000).toFixed(1)
            : null

    return (

        <div className='h-screen w-full overflow-hidden relative bg-gray-100'>

            {/* MAP */}

            <div className='absolute inset-0 z-0'>
                <LiveTracking />
            </div>

            {/* TOP BAR */}

            <div className='absolute top-0 left-0 right-0 z-30 p-4 sm:p-6'>

                <div className='flex items-center justify-between'>

                    <div className='bg-white rounded-xl px-4 py-2 shadow-lg'>
                        <h1 className='text-xl sm:text-2xl font-bold'>
                            Saarthi
                        </h1>
                    </div>

                    <Link
                        to='/captain-home'
                        className='h-11 w-11 bg-white rounded-full shadow-lg flex items-center justify-center'
                    >
                        <i className='text-xl ri-home-5-line'></i>
                    </Link>

                </div>

            </div>

            {/* RIDE CARD */}

            <div className='absolute bottom-0 left-0 right-0 z-20'>

                <div className='bg-white rounded-t-[28px] shadow-2xl px-5 pt-5 pb-6'>

                    <div className='w-12 h-1 bg-gray-300 rounded-full mx-auto mb-5'></div>

                    {/* Passenger + Fare */}

                    <div className='flex items-center justify-between mb-5'>

                        <div>
                            <p className='text-sm text-gray-500'>
                                Passenger
                            </p>
                            <h2 className='text-xl font-bold capitalize'>
                                {rideData?.user?.fullname?.firstname ||
                                    'Passenger'}
                            </h2>
                        </div>

                        <div className='text-right'>
                            <p className='text-sm text-gray-500'>
                                Fare
                            </p>
                            <h2 className='text-xl font-bold'>
                                ₹{rideData?.fare ?? 0}
                            </h2>
                            {distanceKm && (
                                <p className='text-xs text-gray-500'>
                                    {distanceKm} km trip
                                </p>
                            )}
                        </div>

                    </div>

                    {/* Pickup */}

                    <div className='flex items-center gap-4 p-3 border-b'>

                        <div className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0'>
                            <i className='ri-map-pin-user-fill text-xl'></i>
                        </div>

                        <div className='min-w-0'>
                            <p className='text-xs text-gray-500'>
                                Pickup
                            </p>
                            <h3 className='font-semibold truncate'>
                                {rideData?.pickup || 'Pickup location'}
                            </h3>
                        </div>

                    </div>

                    {/* Destination */}

                    <div className='flex items-center gap-4 p-3'>

                        <div className='w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0'>
                            <i className='ri-map-pin-2-fill text-xl'></i>
                        </div>

                        <div className='min-w-0'>
                            <p className='text-xs text-gray-500'>
                                Destination
                            </p>
                            <h3 className='font-semibold truncate'>
                                {rideData?.destination || 'Destination location'}
                            </h3>
                        </div>

                    </div>

                    {/* Complete Ride */}

                    <button
                        type='button'
                        onClick={() => setFinishRidePanel(true)}
                        className='w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold p-3 rounded-xl'
                    >
                        Complete Ride
                    </button>

                </div>

            </div>

            {/* FINISH RIDE
                Initial position is inline (not the Tailwind translate-y-full
                class) so GSAP's transform never clashes with Tailwind v4. */}

            <div
                ref={finishRidePanelRef}
                style={{ transform: 'translateY(100%)' }}
                className='fixed left-0 right-0 bottom-0 z-[100] bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 max-h-[90vh] overflow-y-auto'
            >
                <FinishRide
                    ride={rideData}
                    setFinishRidePanel={setFinishRidePanel}
                />
            </div>

        </div>
    )
}

export default CaptainRiding