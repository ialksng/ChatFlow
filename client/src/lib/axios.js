import axios from "axios";

export const axiosInstance = axios.create({
    baseURL: "/projects/chatflow/api",
    withCredentials: true,
});