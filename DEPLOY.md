# Putting ক্যাম্পাসদর্পণ online (Render)

1. Create a free account at github.com, then a new **private** repository called `campus-darpan`.
   Upload the contents of this folder (the folder that contains `render.yaml`, `backend` and `frontend`).
2. Create a free account at render.com and sign in with GitHub.
3. New > **Blueprint**, choose the repository, and press Apply. Render asks for `ADMIN_INITIAL_PASSWORD`: type a strong password. This is the password for the admin user `asif`.
4. Wait for three things to turn green: the database, `campus-darpan-api` and `campus-darpan`. The first build takes about 5 to 10 minutes.
5. Open `https://campus-darpan.onrender.com`. Admin login is at `/admin/login`.

If Render shows a different address for either service (it adds a suffix when a name is taken), set these two and redeploy:
- on `campus-darpan-api`: `CORS_ORIGINS` = the website address
- on `campus-darpan`: `NEXT_PUBLIC_API_BASE` = the API address

Free plan limits: a service sleeps after 15 minutes without visitors and takes about a minute to wake, and the free database is deleted after 30 days. For students, use the paid Starter plan ($7 a month) for the API and website and a paid database. A custom domain can be added in each service's settings.
