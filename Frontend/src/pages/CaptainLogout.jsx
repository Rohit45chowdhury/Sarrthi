import React, { useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const CaptainLogout = () => {

    const navigate = useNavigate()

    useEffect(() => {

        const logoutCaptain = async () => {

            const token = localStorage.getItem('token')

            try {

                if (token) {

                    const response = await axios.get(
                        'http://localhost:3000/captains/logout',
                        {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        }
                    )

                    console.log('LOGOUT RESPONSE:', response.data)

                }

            } catch (error) {

                console.error(
                    'LOGOUT ERROR:',
                    error.response?.data || error.message
                )

            } finally {

                localStorage.removeItem('token')
                localStorage.removeItem('captain-token')

                navigate('/captain-login', {
                    replace: true
                })
            }
        }

        logoutCaptain()

    }, [navigate])

    return (
        <div className='h-screen flex items-center justify-center'>
            <h2 className='text-xl font-semibold'>
                Logging out...
            </h2>
        </div>
    )
}

export default CaptainLogout