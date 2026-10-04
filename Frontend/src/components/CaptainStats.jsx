import React, { useEffect, useState } from 'react'
import axios from 'axios'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const CaptainStats = () => {

    const [stats, setStats] = useState({
        todayEarnings: 0,
        totalEarnings: 0,
        trips: 0,
        rating: 0
    })

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {

        const fetchStats = async () => {

            console.log('==============================')
            console.log('CAPTAIN STATS FETCH START')
            console.log('BASE_URL:', BASE_URL)

            const token = localStorage.getItem('token')

            console.log('Token exists:', !!token)

            if (!token) {
                console.log('❌ No token found')
                setError('No captain token found')
                setLoading(false)
                return
            }

            try {

                const response = await axios.get(
                    `${BASE_URL}/captains/stats`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                )

                console.log('STATS API RESPONSE:')
                console.log(response.data)

                const data = response.data

                setStats({
                    todayEarnings: Number(data.todayEarnings) || 0,
                    totalEarnings: Number(data.totalEarnings) || 0,
                    trips: Number(data.trips) || 0,
                    rating: Number(data.rating) || 0
                })

            } catch (error) {

                console.error(
                    '❌ Captain stats error:',
                    error.response?.data || error.message
                )

                setError(
                    error.response?.data?.message ||
                    error.message ||
                    'Failed to load stats'
                )

            } finally {

                setLoading(false)

            }
        }

        fetchStats()

    }, [])


    if (loading) {

        return (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

                <div className="h-28 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-28 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-28 animate-pulse rounded-xl bg-gray-200" />
                <div className="h-28 animate-pulse rounded-xl bg-gray-200" />

            </div>
        )
    }


    if (error) {

        return (
            <div className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">

                <p className="text-sm font-bold text-red-600">
                    Captain Stats Error
                </p>

                <p className="mt-1 text-xs text-red-500">
                    {error}
                </p>

            </div>
        )
    }


    return (

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

            {/* TODAY */}

            <div
                className="rounded-xl px-4 py-4 text-white"
                style={{
                    backgroundImage:
                        'linear-gradient(135deg, #12334A, #1d4e6e)'
                }}
            >

                <p className="text-xs text-white/70">
                    Today's earnings
                </p>

                <h2 className="mt-2 text-2xl font-extrabold">
                    ₹{stats.todayEarnings.toFixed(2)}
                </h2>

            </div>


            {/* TOTAL */}

            <div
                className="
                    rounded-xl
                    bg-[#F15A24]/10
                    px-4
                    py-4
                    ring-1
                    ring-[#F15A24]/20
                "
            >

                <p className="text-xs text-gray-500">
                    Total earnings
                </p>

                <h2 className="mt-2 text-2xl font-extrabold text-[#12334A]">
                    ₹{stats.totalEarnings.toFixed(2)}
                </h2>

            </div>


            {/* TRIPS */}

            <div
                className="
                    rounded-xl
                    bg-gray-100
                    px-4
                    py-4
                "
            >

                <i className="text-xl text-[#F15A24] ri-route-line" />

                <h2 className="mt-2 text-2xl font-extrabold text-[#12334A]">
                    {stats.trips}
                </h2>

                <p className="text-xs text-gray-500">
                    Trips
                </p>

            </div>


            {/* RATING */}

            <div
                className="
                    rounded-xl
                    bg-gray-100
                    px-4
                    py-4
                "
            >

                <i className="text-xl text-[#F15A24] ri-star-fill" />

                <h2 className="mt-2 text-2xl font-extrabold text-[#12334A]">
                    {stats.rating > 0
                        ? stats.rating.toFixed(1)
                        : '—'
                    }
                </h2>

                <p className="text-xs text-gray-500">
                    Rating
                </p>

            </div>

        </div>
    )
}

export default CaptainStats