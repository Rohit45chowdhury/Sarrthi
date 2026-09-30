import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import FinishRide from '../components/FinishRide'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import LiveTracking from '../components/LiveTracking'

const CaptainRiding = () => {

    const [finishRidePanel, setFinishRidePanel] = useState(false)
    const [rideData, setRideData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const finishRidePanelRef = useRef(null)

    const location = useLocation()
    const navigate = useNavigate()

    // URL se rideId
    const params = new URLSearchParams(location.search)
    const rideId = params.get('rideId')


    // ==========================================
    // FETCH REAL RIDE
    // ==========================================

    useEffect(() => {

        const fetchRide = async () => {

            if (!rideId) {
                setError('Ride ID not found')
                setLoading(false)
                return
            }

            const token = localStorage.getItem('token')

            if (!token) {
                navigate('/captain-login')
                return
            }

            try {

                console.log('Fetching ride:', rideId)

                const response = await axios.get(
                    `http://localhost:5000/rides/${rideId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                )

                console.log('REAL RIDE RESPONSE:', response.data)

                setRideData(
                    response.data.ride || response.data
                )

            } catch (error) {

                console.error(
                    'FETCH RIDE ERROR:',
                    error.response?.data || error.message
                )

                setError(
                    error.response?.data?.message ||
                    'Unable to fetch ride'
                )

            } finally {

                setLoading(false)

            }
        }

        fetchRide()

    }, [rideId, navigate])


    // ==========================================
    // GSAP FINISH RIDE PANEL
    // ==========================================

    useGSAP(() => {

        if (!finishRidePanelRef.current) return

        if (finishRidePanel) {

            gsap.to(finishRidePanelRef.current, {
                y: 0,
                duration: 0.4,
                ease: 'power3.out'
            })

        } else {

            gsap.to(finishRidePanelRef.current, {
                y: '100%',
                duration: 0.4,
                ease: 'power3.inOut'
            })

        }

    }, [finishRidePanel])


    // ==========================================
    // LOADING
    // ==========================================

    if (loading) {

        return (
            <div className="h-screen w-full flex items-center justify-center">

                <div className="text-center">

                    <div className="w-10 h-10 border-4 border-gray-300 border-t-black rounded-full animate-spin mx-auto"></div>

                    <p className="mt-4 text-gray-600">
                        Loading ride...
                    </p>

                </div>

            </div>
        )
    }


    // ==========================================
    // ERROR
    // ==========================================

    if (error || !rideData) {

        return (
            <div className="h-screen w-full flex items-center justify-center p-5">

                <div className="text-center">

                    <i className="ri-error-warning-line text-5xl text-red-500"></i>

                    <h2 className="text-xl font-bold mt-3">
                        Ride not found
                    </h2>

                    <p className="text-gray-500 mt-2">
                        {error || 'Unable to load ride information'}
                    </p>

                    <button
                        onClick={() => navigate('/captain-home')}
                        className="mt-5 bg-black text-white px-6 py-3 rounded-lg"
                    >
                        Back to Home
                    </button>

                </div>

            </div>
        )
    }


    return (

        <div className="h-screen w-full overflow-hidden relative bg-gray-100">


            {/* ================================= */}
            {/* MAP */}
            {/* ================================= */}

            <div className="absolute inset-0 z-0">

                <LiveTracking />

            </div>


            {/* ================================= */}
            {/* TOP BAR */}
            {/* ================================= */}

            <div className="absolute top-0 left-0 right-0 z-30 p-4 sm:p-6">

                <div className="flex items-center justify-between">

                    <div className="bg-white rounded-xl px-4 py-2 shadow-lg">

                        <h1 className="text-xl sm:text-2xl font-bold">
                            Saarthi
                        </h1>

                    </div>


                    <Link
                        to="/captain-home"
                        className="h-11 w-11 bg-white rounded-full shadow-lg flex items-center justify-center"
                    >

                        <i className="text-xl ri-home-5-line"></i>

                    </Link>

                </div>

            </div>


            {/* ================================= */}
            {/* RIDE CARD */}
            {/* ================================= */}

            <div className="absolute bottom-0 left-0 right-0 z-20">

                <div className="bg-white rounded-t-[28px] shadow-2xl px-5 pt-5 pb-6">

                    <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-5"></div>


                    {/* Passenger + Fare */}

                    <div className="flex items-center justify-between mb-5">

                        <div>

                            <p className="text-sm text-gray-500">
                                Passenger
                            </p>

                            <h2 className="text-xl font-bold capitalize">

                                {rideData?.user?.fullname?.firstname ||
                                    'Passenger'}

                            </h2>

                        </div>


                        <div className="text-right">

                            <p className="text-sm text-gray-500">
                                Fare
                            </p>

                            <h2 className="text-xl font-bold">
                                ₹{rideData?.fare || 0}
                            </h2>

                        </div>

                    </div>


                    {/* Pickup */}

                    <div className="flex items-center gap-4 p-3 border-b">

                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">

                            <i className="ri-map-pin-user-fill text-xl"></i>

                        </div>

                        <div>

                            <p className="text-xs text-gray-500">
                                Pickup
                            </p>

                            <h3 className="font-semibold">
                                {rideData?.pickup ||
                                    'Pickup location'}
                            </h3>

                        </div>

                    </div>


                    {/* Destination */}

                    <div className="flex items-center gap-4 p-3">

                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">

                            <i className="ri-map-pin-2-fill text-xl"></i>

                        </div>

                        <div>

                            <p className="text-xs text-gray-500">
                                Destination
                            </p>

                            <h3 className="font-semibold">
                                {rideData?.destination ||
                                    'Destination location'}
                            </h3>

                        </div>

                    </div>


                    {/* Complete Ride */}

                    <button
                        onClick={() => setFinishRidePanel(true)}
                        className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold p-3 rounded-xl"
                    >
                        Complete Ride
                    </button>

                </div>

            </div>


            {/* ================================= */}
            {/* FINISH RIDE */}
            {/* ================================= */}

            <div
                ref={finishRidePanelRef}
                className="fixed left-0 right-0 bottom-0 z-[100] translate-y-full bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 max-h-[90vh] overflow-y-auto"
            >

                <button
                    onClick={() => setFinishRidePanel(false)}
                    className="absolute right-4 top-4 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
                >
                    <i className="ri-close-line text-xl"></i>
                </button>


                <FinishRide
                    ride={rideData}
                    setFinishRidePanel={setFinishRidePanel}
                />

            </div>

        </div>
    )
}

export default CaptainRiding