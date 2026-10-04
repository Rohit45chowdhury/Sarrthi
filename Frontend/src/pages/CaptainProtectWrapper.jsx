import React, {
    useContext,
    useEffect,
    useState
} from 'react'

import {
    CaptainDataContext
} from '../context/CapatainContext'

import {
    useNavigate
} from 'react-router-dom'

import axios from 'axios'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'


const CaptainProtectWrapper = ({ children }) => {

    const navigate = useNavigate()

    const {
        updateCaptain
    } = useContext(CaptainDataContext)

    const [isLoading, setIsLoading] = useState(true)
    const [isAuthorized, setIsAuthorized] = useState(false)


    useEffect(() => {

        let mounted = true

        const verifyCaptain = async () => {

            const token =
                localStorage.getItem('token')


            // =========================================
            // NO TOKEN
            // =========================================

            if (!token) {

                console.log(
                    'No captain token found'
                )

                if (mounted) {

                    setIsAuthorized(false)
                    setIsLoading(false)

                    navigate(
                        '/captain-login',
                        {
                            replace: true
                        }
                    )
                }

                return
            }


            // =========================================
            // VERIFY TOKEN WITH BACKEND
            // =========================================

            try {

                console.log(
                    'Verifying captain token...'
                )

                const response =
                    await axios.get(
                        `${BASE_URL}/captains/profile`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            }
                        }
                    )


                console.log(
                    'Captain profile:',
                    response.data
                )


                const captainData =
                    response.data?.captain ||
                    response.data?.user ||
                    response.data


                // =========================================
                // INVALID PROFILE
                // =========================================

                if (
                    !captainData ||
                    !captainData._id
                ) {

                    throw new Error(
                        'Invalid captain profile'
                    )
                }


                // =========================================
                // SUCCESS
                // =========================================

                if (!mounted) return


                updateCaptain(
                    captainData
                )

                setIsAuthorized(true)
                setIsLoading(false)


            } catch (error) {

                console.error(
                    'Captain authentication failed:',
                    error.response?.data ||
                    error.message
                )


                // Remove invalid authentication
                localStorage.removeItem(
                    'token'
                )

                localStorage.removeItem(
                    'captain'
                )


                if (!mounted) return


                setIsAuthorized(false)
                setIsLoading(false)


                navigate(
                    '/captain-login',
                    {
                        replace: true
                    }
                )
            }
        }


        verifyCaptain()


        return () => {

            mounted = false

        }

    }, [navigate, updateCaptain])


    // =========================================
    // LOADING
    // =========================================

    if (isLoading) {

        return (
            <div className="flex h-screen items-center justify-center bg-white">

                <div className="text-center">

                    <div
                        className="
                            mx-auto
                            mb-4
                            h-10
                            w-10
                            animate-spin
                            rounded-full
                            border-4
                            border-[#12334A]
                            border-t-[#F15A24]
                        "
                    />

                    <p className="font-medium text-[#12334A]">
                        Verifying captain...
                    </p>

                </div>

            </div>
        )
    }


    // =========================================
    // NOT AUTHORIZED
    // =========================================

    if (!isAuthorized) {
        return null
    }


    // =========================================
    // AUTHORIZED
    // =========================================

    return children
}


export default CaptainProtectWrapper