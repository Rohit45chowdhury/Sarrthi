import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const FinishRide = (props) => {

    const navigate = useNavigate()

    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const ride = props.ride

    // ride.distance on the riding page is the trip distance in metres
    const distanceKm =
        ride?.distance != null && Number.isFinite(Number(ride.distance))
            ? (Number(ride.distance) / 1000).toFixed(1)
            : null

    async function endRide() {

        if (loading) return

        const rideId = ride?._id || ride?.rideId

        if (!rideId) {
            setError('Ride ID is missing. Please go back to home.')
            return
        }

        const token = localStorage.getItem('token')

        if (!token) {
            navigate('/captain-login')
            return
        }

        setError('')
        setLoading(true)

        try {

            const response = await axios.post(
                `${BASE_URL}/rides/end-ride`,
                { rideId },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            )

            if (response.status === 200) {

                // ride is over, so a refresh must not bring it back
                sessionStorage.removeItem('activeRide')

                navigate('/captain-home')
            }

        } catch (err) {

            console.error(
                'END RIDE ERROR:',
                err.response?.data || err.message
            )

            setError(
                err.response?.data?.message ||
                'Could not finish the ride, please try again'
            )

        } finally {

            setLoading(false)
        }
    }

    return (
    <div className="relative mx-auto w-full max-w-4xl">

        {/* CLOSE BUTTON */}
        <button
            type="button"
            onClick={() => props.setFinishRidePanel(false)}
            aria-label="Close finish ride panel"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-8 flex items-center justify-center"
        >
            <i className="text-3xl text-gray-300 ri-arrow-down-wide-line"></i>
        </button>

        {/* HEADING */}
        <div className="pt-8 mb-4 flex items-center justify-between">
            <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#12334A]">
                    Finish this ride
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                    Complete the trip once the rider is dropped off
                </p>
            </div>

            <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F15A24]" />
            </span>
        </div>


        {/* ERROR */}
        {error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                <i className="ri-error-warning-line text-lg"></i>
                <span className="min-w-0 break-words">{error}</span>
            </div>
        )}


        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">

            {/* ================= LEFT COLUMN ================= */}
            <div className="space-y-4">

                {/* RIDER PROFILE CARD */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg sm:p-5">

                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                    <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

                    <div className="relative flex items-center gap-4">

                        {/* PROFILE IMAGE */}
                        <div className="relative shrink-0">

                            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-extrabold text-[#12334A] ring-4 ring-[#F15A24] ring-offset-2 ring-offset-[#12334A] sm:h-20 sm:w-20 sm:text-3xl">

                                <span>
                                    {String(ride?.user?.fullname?.firstname || 'R')
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>

                                {(ride?.user?.profileImage ||
                                    ride?.user?.profilePhoto ||
                                    ride?.user?.avatar ||
                                    ride?.user?.image ||
                                    ride?.user?.photo) && (
                                    <img
                                        src={
                                            ride?.user?.profileImage ||
                                            ride?.user?.profilePhoto ||
                                            ride?.user?.avatar ||
                                            ride?.user?.image ||
                                            ride?.user?.photo
                                        }
                                        alt={ride?.user?.fullname?.firstname || 'Rider'}
                                        className="absolute inset-0 h-full w-full object-cover"
                                        onError={e => {
                                            e.currentTarget.style.display = 'none'
                                        }}
                                    />
                                )}

                            </div>

                            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#12334A] bg-[#F15A24] text-xs text-white">
                                <i className="ri-user-3-fill"></i>
                            </div>

                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wide text-white/60">
                                Rider
                            </p>
                            <h2 className="truncate text-xl font-extrabold capitalize sm:text-2xl">
                                {ride?.user?.fullname?.firstname || 'Rider'}
                            </h2>

                            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                                <i className="ri-route-line text-[#F15A24]"></i>
                                {distanceKm ? `${distanceKm} km` : '—'}
                            </div>
                        </div>

                    </div>
                </div>


                {/* ROUTE CARD */}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">

                    <div className="flex gap-4">

                        {/* timeline */}
                        <div className="flex flex-col items-center pt-1">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                <i className="ri-map-pin-user-fill text-sm"></i>
                            </span>
                            <span className="my-1 w-px flex-1 border-l-2 border-dashed border-gray-300" />
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-map-pin-2-fill text-sm"></i>
                            </span>
                        </div>

                        {/* addresses */}
                        <div className="min-w-0 flex-1 space-y-4">

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Pickup
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {ride?.pickup || 'Unavailable'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Destination
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {ride?.destination || 'Unavailable'}
                                </p>
                            </div>

                        </div>

                    </div>
                </div>

            </div>


            {/* ================= RIGHT COLUMN ================= */}
            <div className="flex flex-col gap-4">

                {/* TRIP SUMMARY */}
                <div className="rounded-2xl bg-[#F5F7FA] p-4 sm:p-5">

                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Trip summary
                    </p>

                    <div className="grid grid-cols-2 gap-3">

                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-route-line text-lg"></i>
                            </div>
                            <p className="text-xs text-gray-500">Distance</p>
                            <p className="text-lg font-bold text-[#12334A]">
                                {distanceKm ? `${distanceKm} km` : '—'}
                            </p>
                        </div>

                        <div className="rounded-xl bg-white p-3 shadow-sm">
                            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-money-rupee-circle-line text-lg"></i>
                            </div>
                            <p className="text-xs text-gray-500">Payment</p>
                            <p className="text-lg font-bold text-[#12334A]">Cash</p>
                        </div>

                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                        <p className="text-sm font-medium text-gray-500">
                            Collect from rider
                        </p>
                        <h3 className="text-3xl font-extrabold text-[#12334A]">
                            ₹{ride?.fare ?? 0}
                        </h3>
                    </div>

                </div>


                {/* FINISH BUTTON */}
                <button
                    type="button"
                    onClick={endRide}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 text-base font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 lg:mt-auto"
                >
                    {loading ? (
                        <>
                            <i className="ri-loader-4-line animate-spin text-xl"></i>
                            Finishing...
                        </>
                    ) : (
                        <>
                            Finish ride
                            <i className="ri-check-double-line text-xl"></i>
                        </>
                    )}
                </button>

            </div>

        </div>

    </div>
)
}

export default FinishRide