import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const deployRoot = path.join(root, 'deploy', 'scf')
const deployBackend = path.join(deployRoot, 'backend')

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function injectScfLinuxDependencies(packageJsonPath, packageLockPath) {
  const scfLinuxDependencies = {
    '@img/sharp-libvips-linux-x64': '1.2.4',
    '@img/sharp-linux-x64': '0.34.5',
    '@ffmpeg-installer/linux-x64': '4.1.0',
    '@ffprobe-installer/linux-x64': '5.2.0',
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  packageJson.dependencies = {
    ...packageJson.dependencies,
    ...scfLinuxDependencies,
  }
  writeJson(packageJsonPath, packageJson)

  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'))
  packageLock.packages[''].dependencies = {
    ...packageLock.packages[''].dependencies,
    ...scfLinuxDependencies,
  }
  for (const name of Object.keys(scfLinuxDependencies)) {
    const packageEntry = packageLock.packages[`node_modules/${name}`]
    if (packageEntry) delete packageEntry.optional
  }
  writeJson(packageLockPath, packageLock)
}

fs.rmSync(deployRoot, { recursive: true, force: true })
fs.mkdirSync(deployBackend, { recursive: true })

run('npm', ['run', 'build'], path.join(root, 'frontend'))
run('npm', ['run', 'build'], path.join(root, 'backend'))

copyDir(path.join(root, 'frontend', 'dist-vite'), path.join(deployRoot, 'public'))
copyDir(path.join(root, 'backend', 'dist'), path.join(deployBackend, 'dist'))
copyDir(path.join(root, 'skills'), path.join(deployRoot, 'skills'))

copyFile(path.join(root, 'backend', 'package.json'), path.join(deployRoot, 'package.json'))
copyFile(path.join(root, 'backend', 'package-lock.json'), path.join(deployRoot, 'package-lock.json'))
injectScfLinuxDependencies(
  path.join(deployRoot, 'package.json'),
  path.join(deployRoot, 'package-lock.json'),
)

const bootstrapPath = path.join(deployRoot, 'scf_bootstrap')
copyFile(path.join(root, 'deploy', 'scf_bootstrap.template'), bootstrapPath)
fs.chmodSync(bootstrapPath, 0o755)

copyFile(path.join(root, 'serverless.yml'), path.join(deployRoot, 'serverless.yml'))

console.log(`SCF artifact assembled at ${deployRoot}`)
console.log('For cloud deployment, configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME outside Git.')
console.log('Do not copy Windows node_modules. Use installDependency: true or run npm ci --omit=dev in Linux.')
