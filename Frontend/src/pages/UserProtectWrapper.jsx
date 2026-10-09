
import React, { useContext, useEffect, useState } from "react";
import { UserDataContext } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const UserProtectWrapper = ({ children }) => {
    const navigate = useNavigate();
    const { setUser } = useContext(UserDataContext);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("token");
        let cancelled = false;

        const checkUser = async () => {
            if (!token) {
                setIsLoading(false);
                navigate("/login", { replace: true });
                return;
            }

            const config = {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            };

            try {
                let user;

                // 1. Try normal user profile first
                try {
                    const response = await axios.get(
                        `${API}/users/profile`,
                        config
                    );

                    user = response.data.user ?? response.data;
                } catch (profileError) {
                    // 2. Fallback for OTP / Google login
                    const response = await axios.get(
                        `${API}/auth/me`,
                        config
                    );

                    user = response.data.user ?? response.data;
                }

                if (cancelled) return;

                if (!user || !(user._id || user.id) || !user.email) {
                    throw new Error("Invalid user profile response");
                }

                const firstName =
                    typeof user.fullname === "object"
                        ? user.fullname?.firstname
                        : user.fullname;

                const normalizedUser = {
                    ...user,
                    _id: user._id || user.id,
                    fullname: {
                        firstname:
                            firstName || user.email.split("@")[0],
                        lastname:
                            typeof user.fullname === "object"
                                ? user.fullname?.lastname || ""
                                : "",
                    },
                };

                setUser(normalizedUser);
                setIsLoading(false);
            } catch (error) {
                if (cancelled) return;

                console.error(
                    "Authentication check failed:",
                    error.response?.data || error.message
                );

                localStorage.removeItem("token");
                setUser(null);
                setIsLoading(false);
                navigate("/login", { replace: true });
            }
        };

        checkUser();

        return () => {
            cancelled = true;
        };
    }, [navigate, setUser]);

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center text-[#12334A]">
                Checking authentication...
            </div>
        );
    }

    // Redirecting to login when authentication fails
    if (!localStorage.getItem("token")) {
        return null;
    }

    return <>{children}</>;
};

export default UserProtectWrapper;
