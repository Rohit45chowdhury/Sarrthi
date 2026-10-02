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
        <div className='relative'>

            <h5
                className='p-1 text-center w-full absolute top-0 left-0 cursor-pointer'
                onClick={() => props.setFinishRidePanel(false)}
            >
                <i className='text-3xl text-gray-300 ri-arrow-down-wide-line'></i>
            </h5>

            <h3 className='text-2xl font-semibold mb-5 pt-6'>
                Finish this Ride
            </h3>

            <div className='flex items-center justify-between p-4 border-2 border-yellow-400 rounded-lg mt-4'>

                <div className='flex items-center gap-3'>
                    <img
                        className='h-12 rounded-full object-cover w-12'
                        src='https://i.pinimg.com/236x/af/26/28/af26280b0ca305be47df0b799ed1b12b.jpg'
                        alt=''
                    />
                    <h2 className='text-lg font-medium capitalize'>
                        {ride?.user?.fullname?.firstname || 'Rider'}
                    </h2>
                </div>

                <h5 className='text-lg font-semibold'>
                    {distanceKm ? `${distanceKm} KM` : '—'}
                </h5>

            </div>

            {error && (
                <div className='mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600'>
                    {error}
                </div>
            )}

            <div className='flex gap-2 justify-between flex-col items-center'>

                <div className='w-full mt-5'>

                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className='ri-map-pin-user-fill'></i>
                        <div className='min-w-0'>
                            <h3 className='text-lg font-medium'>Pickup</h3>
                            <p className='text-sm -mt-1 text-gray-600'>
                                {ride?.pickup || 'Unavailable'}
                            </p>
                        </div>
                    </div>

                    <div className='flex items-center gap-5 p-3 border-b-2'>
                        <i className='text-lg ri-map-pin-2-fill'></i>
                        <div className='min-w-0'>
                            <h3 className='text-lg font-medium'>Destination</h3>
                            <p className='text-sm -mt-1 text-gray-600'>
                                {ride?.destination || 'Unavailable'}
                            </p>
                        </div>
                    </div>

                    <div className='flex items-center gap-5 p-3'>
                        <i className='ri-currency-line'></i>
                        <div>
                            <h3 className='text-lg font-medium'>
                                ₹{ride?.fare ?? 0}
                            </h3>
                            <p className='text-sm -mt-1 text-gray-600'>Cash</p>
                        </div>
                    </div>

                </div>

                <div className='mt-10 w-full'>

                    <button
                        type='button'
                        onClick={endRide}
                        disabled={loading}
                        className='w-full mt-5 flex text-lg justify-center bg-green-600 text-white font-semibold p-3 rounded-lg disabled:opacity-60'
                    >
                        {loading ? 'Finishing...' : 'Finish Ride'}
                    </button>

                </div>

            </div>

        </div>
    )
}

export default FinishRide