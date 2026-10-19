// Lecture des métadonnées des mods et vérification d'un profil sans lancer le jeu.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { allowed, clientArguments, libraryPath, offlineUuid, profileVersionId } from '../src/core/gameTests/clientLaunch'
import { guessMajor } from '../src/core/gameTests/java'
import { issueKey, LogIssueCollector, newIssues } from '../src/core/gameTests/logIssues'
import { parseToml, readModJar } from '../src/core/gameTests/modMetadata'
import { parseLoader, serverKey } from '../src/core/gameTests/serverInstall'
import { checkProfileFiles } from '../src/core/gameTests/staticChecks'
import { compareMaven, matchesFabric, matchesMaven } from '../src/core/gameTests/versions'
import { makeInstance, tempDir } from './support/fixtures'
import { fabricJar, forgeToml, makeJar } from './support/jars'

describe('métadonnées des mods', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  it('lit un mods.toml, chaînes sur plusieurs lignes comprises', () => {
    const tables = parseToml(forgeToml('alpha', [{ modId: 'forge', mandatory: true }, { modId: 'jei', mandatory: false }]))
    assert.equal(tables.mods[0].modId, 'alpha')
    assert.equal(tables.mods[0].description, 'Un mod\nsur plusieurs lignes')
    assert.deepEqual(tables['dependencies.alpha'].map((d) => [d.modId, d.mandatory]), [['forge', true], ['jei', false]])
  })

  it('lit un mod Fabric, ses mods embarqués et son côté', async () => {
    const inner = await fabricJar('fabric-api-base')
    const file = join(root.dir, 'api.jar')
    await writeFile(
      file,
      await fabricJar('fabric-api', { fabricloader: '*' }, { jars: [{ file: 'META-INF/jars/base.jar' }], provides: ['fabric'] }, {
        'META-INF/jars/base.jar': inner
      })
    )
    const meta = await readModJar(file)
    assert.equal(meta?.loader, 'fabric')
    assert.deepEqual(meta?.mods.map((m) => [m.id, m.side, m.requires]), [['fabric-api', 'both', ['fabricloader']]])
    assert.deepEqual(meta?.nested.map((m) => m.id).sort(), ['fabric', 'fabric-api-base'])

    const sodium = join(root.dir, 'sodium.jar')
    await writeFile(sodium, await fabricJar('sodium', {}, { environment: 'client' }))
    assert.equal((await readModJar(sodium))?.mods[0].side, 'client')
  })

  it('lit un jar multi-chargeurs selon le chargeur du profil, et reconnaît une bibliothèque', async () => {
    const file = join(root.dir, 'multi.jar')
    await writeFile(file, await makeJar({ 'fabric.mod.json': JSON.stringify({ id: 'multi', depends: { fabric: '*' } }), 'META-INF/mods.toml': forgeToml('multi') }))
    assert.equal((await readModJar(file, 'forge'))?.loader, 'forge')
    assert.equal((await readModJar(file, 'fabric'))?.loader, 'fabric')
    const lib = join(root.dir, 'kotlin.jar')
    await writeFile(lib, await makeJar({ 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nFMLModType: LANGPROVIDER\n' }))
    assert.equal((await readModJar(lib))?.library, true)
  })
})

describe('vérification d’un profil', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string

  before(async () => {
    root = await tempDir()
    profile = await makeInstance(join(root.dir, 'Instances'), 'Profil Forge', { loader: 'forge-47.4.18', mods: [] })
    await mkdir(join(profile, 'mods'), { recursive: true })
    const jar = (name: string, data: Buffer) => writeFile(join(profile, 'mods', name), data)
    await jar('alpha.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('alpha', [{ modId: 'forge', mandatory: true }, { modId: 'geckolib', mandatory: true }, { modId: 'jei', mandatory: false }]) }))
    await jar('caves-1.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('cave_dweller') }))
    await jar('caves-2.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('cave_dweller') }))
    await jar('neo.jar', await makeJar({ 'META-INF/neoforge.mods.toml': forgeToml('neo', [{ modId: 'beta', type: 'required' }]) }))
    await jar('beta.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('beta') }))
    await jar('fabric-only.jar', await fabricJar('fabriconly'))
    await jar('shader.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('oculus') }))
    await jar('kotlin.jar', await makeJar({ 'META-INF/MANIFEST.MF': 'FMLModType: LANGPROVIDER\n' }))
    // CurseForge dit d'oculus qu'il ne sert que côté client.
    const instanceFile = join(profile, 'minecraftinstance.json')
    const instance = JSON.parse(await readFile(instanceFile, 'utf8'))
    instance.installedAddons = [{ addonID: 5, fileNameOnDisk: 'shader.jar', installedFile: { id: 1, gameVersion: ['1.20.1', 'Forge', 'Client'] } }]
    await writeFile(instanceFile, JSON.stringify(instance))
  })
  after(() => root.cleanup())

  it('trouve les doublons, les dépendances manquantes, le mauvais chargeur et les mods du client', async () => {
    const report = await checkProfileFiles(profile)
    assert.equal(report.jars, 8)
    const byMessage = (pattern: RegExp) => report.findings.find((f) => pattern.test(f.message))
    assert.deepEqual([byMessage(/cave_dweller/)?.severity, byMessage(/cave_dweller/)?.files], ['warning', ['caves-1.jar', 'caves-2.jar']])
    assert.deepEqual(byMessage(/geckolib/)?.files, ['alpha.jar'])
    assert.ok(!byMessage(/« jei »/), 'une dépendance facultative ne manque pas')
    assert.ok(!byMessage(/« beta »/), 'beta est présent')
    // Forge ignore un jar Fabric, et un jar qui n'a que la description de NeoForge : inutiles, mais sans danger.
    assert.deepEqual([byMessage(/faits pour/)?.severity, byMessage(/faits pour/)?.files], ['warning', ['fabric-only.jar', 'neo.jar']])
    assert.deepEqual(report.clientOnly, ['shader.jar'])
    assert.ok(!report.findings.some((f) => f.files.includes('kotlin.jar')), 'une bibliothèque n’est pas signalée')
  })
})

describe('serveur de test', () => {
  it('reconnaît le chargeur d’un profil et le Java attendu', () => {
    assert.deepEqual(parseLoader('forge-47.4.18', '1.20.1'), { kind: 'forge', version: '47.4.18', minecraftVersion: '1.20.1' })
    assert.deepEqual(parseLoader('fabric-0.19.5-26.3', '26.3'), { kind: 'fabric', version: '0.19.5', minecraftVersion: '26.3' })
    assert.equal(serverKey(parseLoader('neoforge-21.1.215', '1.21.1')!), 'neoforge-1.21.1-21.1.215')
    assert.equal(parseLoader('quilt-0.26', '1.20.1'), null)
    assert.deepEqual(['1.16.5', '1.18.2', '1.20.1', '1.20.6', '1.21.1', '26.3'].map(guessMajor), [8, 17, 17, 21, 21, 25])
  })
})

describe('versions demandées par les mods', () => {
  it('compare comme Fabric : prédicats, jokers, pré-versions, métadonnées de build', () => {
    const cases: Array<[string | string[], string, boolean | null]> = [
      ['>=0.19.5', '0.19.3', false],
      ['>=0.19.5', '0.19.5', true],
      ['~1.21.0', '1.21.1', true],
      ['~1.21.0', '1.22', false],
      ['^1.2', '1.9.4', true],
      ['^1.2', '2.0.0', false],
      ['1.21.x', '1.21.8', true],
      ['1.21.x', '1.20.1', false],
      ['>=1.21.2-alpha.24.38.a <1.21.4-', '1.21.3', true],
      ['>=1.21.2-alpha.24.38.a <1.21.4-', '1.21.4', false],
      [['1.21', '1.21.1'], '1.21.1', true],
      ['0.5.11', '0.6.13+mc1.21.1', false],
      ['>=0.6.0', '0.6.13+mc1.21.1', true],
      ['*', 'n’importe quoi', true],
      ['>=1.0', 'version-illisible', null]
    ]
    for (const [predicate, version, expected] of cases) assert.equal(matchesFabric(predicate, version), expected, `${predicate} / ${version}`)
  })

  it('compare comme Forge (Maven) : sous-versions après un tiret, qualificatifs, plages', () => {
    assert.ok(compareMaven('1.8.2-55', '1.8-54')! > 0)
    assert.ok(compareMaven('1.0.12a', '1.0.12')! > 0, 'une lettre seule n’est pas alpha')
    assert.ok(compareMaven('1.0-alpha1', '1.0')! < 0)
    assert.equal(compareMaven('1.0.0', '1'), 0)
    const cases: Array<[string, string, boolean | null]> = [
      ['[1.8-54,)', '1.8.2-55', true],
      ['[1.0.12,)', '1.0.12a', true],
      ['[1.19-5.1.0.0,)', '1.19.2-5.1.6.4', true],
      ['[1.21-87-NEOFORGE,)', '1.21.1-92-NEOFORGE', true],
      ['(,1.21-3.4.4]', '1.21.1-3.14.8', false],
      ['[47,)', '47.4.18', true],
      ['[48,)', '47.4.18', false],
      ['[1.20.1]', '1.20.1', true],
      ['[1.21,1.21.1)', '1.21.1', false],
      ['[1,2),[3,4)', '3.5', true],
      ['1.0', '0.1', true],
      ['[1.20, 1.20.1,)', '1.20.1', null]
    ]
    for (const [range, version, expected] of cases) assert.equal(matchesMaven(range, version), expected, `${range} / ${version}`)
  })
})

describe('versions et incompatibilités dans un profil', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  async function profileWith(name: string, loader: string, gameVersion: string, jars: Record<string, Buffer>) {
    const profile = await makeInstance(join(root.dir, 'Instances'), name, { loader, mods: [] })
    const instanceFile = join(profile, 'minecraftinstance.json')
    const instance = JSON.parse(await readFile(instanceFile, 'utf8'))
    await writeFile(instanceFile, JSON.stringify({ ...instance, gameVersion }))
    await mkdir(join(profile, 'mods'), { recursive: true })
    for (const [file, data] of Object.entries(jars)) await writeFile(join(profile, 'mods', file), data)
    return (await checkProfileFiles(profile)).findings.map((f) => `${f.severity} ${f.message}`)
  }

  it('Fabric : jeu, chargeur, version d’un autre mod, incompatibilités, mod fourni par un autre', async () => {
    const messages = await profileWith('Fabric', 'fabric-0.19.3-1.21.11', '1.21.11', {
      'kotlin.jar': await fabricJar('fabric-language-kotlin', { fabricloader: '>=0.19.5' }),
      'old.jar': await fabricJar('old', { minecraft: '~1.20' }),
      'lib.jar': await fabricJar('lib'),
      'needs-lib.jar': await fabricJar('needs-lib', { lib: '>=2.0' }),
      'breaker.jar': await fabricJar('breaker', {}, { breaks: { lib: '<2' }, conflicts: { 'needs-lib': '*' } }),
      // Sodium fournit « indium » : Fabric écarte alors le vrai Indium, qui demande un autre Sodium, sans planter.
      'indium.jar': await fabricJar('indium', { sodium: '0.5.11' }),
      'sodium.jar': await fabricJar('sodium', {}, { version: '0.6.13+mc1.21.1', provides: ['indium'] })
    })
    const has = (m: string) => assert.ok(messages.includes(m), `${m}\nparmi :\n${messages.join('\n')}`)
    has('error « fabric-language-kotlin » demande Fabric Loader >=0.19.5, mais le profil a la 0.19.3.')
    has('error « old » est fait pour Minecraft ~1.20, pas pour la 1.21.11 du profil.')
    has('error « needs-lib » demande « lib » en version >=2.0, mais la version installée est la 1.0.0.')
    has('error « breaker » refuse de démarrer avec « lib » 1.0.0 : ces mods sont incompatibles.')
    has('warning « breaker » déconseille « needs-lib » 1.0.0 : ils peuvent mal fonctionner ensemble.')
    assert.ok(!messages.some((m) => m.includes('« sodium »')), 'Indium est fourni par Sodium')
  })

  it('Forge : version voisine du jeu acceptée, version du jar dans son manifeste, mods embarqués de metadata.json', async () => {
    const inner = await makeJar({ 'META-INF/mods.toml': forgeToml('esl', [], '', '1.1.3') })
    const messages = await profileWith('Forge', 'forge-47.4.18', '1.20.1', {
      'neighbour.jar': await makeJar({ 'META-INF/mods.toml': forgeToml('neighbour', [{ modId: 'minecraft', mandatory: true, versionRange: '[1.20]' }]) }),
      'wrong-mc.jar': await makeJar({ 'META-INF/mods.toml': forgeToml('wrongmc', [{ modId: 'minecraft', mandatory: true, versionRange: '[1.21.1]' }]) }),
      'new-forge.jar': await makeJar({ 'META-INF/mods.toml': forgeToml('newforge', [{ modId: 'forge', mandatory: true, versionRange: '[48,)' }]) }),
      'jarversion.jar': await makeJar({
        'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nImplementation-Version: 2.5.0\n',
        'META-INF/mods.toml': forgeToml('jarversion', [], '', '${file.jarVersion}')
      }),
      'needs-new.jar': await makeJar({ 'META-INF/mods.toml': forgeToml('needsnew', [{ modId: 'jarversion', mandatory: true, versionRange: '[3,)' }]) }),
      'incompatible.jar': await makeJar({ 'META-INF/mods.toml': forgeToml('incompat', [{ modId: 'jarversion', type: 'incompatible', versionRange: '(,2.4]' }]) }),
      'new-age.jar': await makeJar({
        'META-INF/mods.toml': forgeToml('create_new_age', [{ modId: 'esl', mandatory: true, versionRange: '[1.1.3]' }]),
        'META-INF/jarjar/metadata.json': JSON.stringify({ jars: [{ path: 'META-INF/jars/esl.jar' }] }),
        'META-INF/jars/esl.jar': inner
      })
    })
    const has = (m: string) => assert.ok(messages.includes(m), `${m}\nparmi :\n${messages.join('\n')}`)
    assert.ok(!messages.some((m) => m.includes('neighbour')), 'Forge 1.20.1 accepte un mod fait pour 1.20')
    has('error « wrongmc » est fait pour Minecraft [1.21.1], pas pour la 1.20.1 du profil.')
    has('error « newforge » demande Forge [48,), mais le profil a la 47.4.18.')
    has('error « needsnew » demande « jarversion » en version [3,), mais la version installée est la 2.5.0.')
    assert.ok(!messages.some((m) => m.includes('incompat')), '2.5.0 est hors de la plage incompatible')
    assert.ok(!messages.some((m) => m.includes('esl')), 'esl est embarqué dans create_new_age')
  })
})

describe('erreurs des journaux', () => {
  it('regroupe les erreurs aux nombres près, garde l’exception, ignore les avertissements anodins', () => {
    const log = new LogIssueCollector()
    for (const line of [
      '[15:19:43] [Server thread/INFO]: Done (12.3s)!',
      '[19Oct2026 15:19:43.123] [main/ERROR] [net.minecraftforge.fml.loading.ModSorter/LOADING]: Missing dependency in slot 3',
      '[19Oct2026 15:19:44.456] [main/ERROR] [net.minecraftforge.fml.loading.ModSorter/LOADING]: Missing dependency in slot 12',
      "[15:19:45] [Server thread/ERROR]: Couldn't load recipe create:mixing/foo",
      'java.lang.IllegalStateException: Unknown item create:foo',
      '\tat net.minecraft.Foo.bar(Foo.java:12)',
      '[15:19:46] [Server thread/WARN]: Ambiguity between arguments [teleport, targets, location]',
      '[15:19:47] [Server thread/WARN]: Failed to load datapack bar'
    ]) {
      log.add(line)
    }
    const issues = log.list()
    assert.deepEqual(
      issues.map((i) => [i.level, i.source, i.count]),
      [
        ['error', 'ModSorter', 2],
        ['error', null, 1],
        ['warning', null, 1]
      ]
    )
    assert.equal(issues[1].detail, 'java.lang.IllegalStateException: Unknown item create:foo')
    assert.equal(issueKey('error', null, 'Chunk at 12, -40 failed in 0x1f2e3d4c'), issueKey('error', null, 'Chunk at 3, 7 failed in 0xdeadbeef'))
    const later = new LogIssueCollector()
    later.add("[10:00:00] [Server thread/ERROR]: Couldn't load recipe create:mixing/foo")
    later.add('[10:00:01] [Server thread/ERROR]: Script error in kubejs/server_scripts/main.js#42')
    assert.deepEqual(
      newIssues(later.list(), issues).map((i) => i.message),
      ['Script error in kubejs/server_scripts/main.js#42']
    )
  })
})

describe('lancement d’un client', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  it('calcule l’UUID d’un joueur hors ligne, le chemin d’une bibliothèque et applique les règles du lanceur', () => {
    assert.equal(offlineUuid('Notch'), 'b50ad385829d3141a2167e7d7539ba7f')
    assert.equal(libraryPath('org.lwjgl:lwjgl:3.3.1:natives-windows'), 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar')
    assert.equal(allowed([{ action: 'allow', os: { name: 'windows' } }]), true)
    assert.equal(allowed([{ action: 'allow', os: { name: 'osx' } }]), false)
    assert.equal(allowed([{ action: 'allow', features: { is_demo_user: true } }]), false)
    const loader = { name: 'fabric-0.19.5-26.3', versionJson: JSON.stringify({ id: 'fabric-loader-0.19.5-26.3' }) }
    assert.equal(profileVersionId({ baseModLoader: loader }), 'fabric-loader-0.19.5-26.3')
  })

  it('construit la commande du jeu d’après les fichiers de version, comme le lanceur', async () => {
    const install = join(root.dir, 'Install')
    const write = async (path: string, content: string) => {
      await mkdir(join(install, path, '..'), { recursive: true })
      await writeFile(join(install, path), content)
    }
    await write(
      'versions/1.21.8/1.21.8.json',
      JSON.stringify({
        id: '1.21.8',
        type: 'release',
        mainClass: 'net.minecraft.client.main.Main',
        assetIndex: { id: '26' },
        libraries: [
          { name: 'com.mojang:brigadier:1.3.10', downloads: { artifact: { path: 'com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar' } } },
          { name: 'org.ow2.asm:asm:9.6' },
          { name: 'org.lwjgl:lwjgl:3.3.3:natives-macos', rules: [{ action: 'allow', os: { name: 'osx' } }] }
        ],
        arguments: {
          game: [
            '--username',
            '${auth_player_name}',
            '--gameDir',
            '${game_directory}',
            '--assetIndex',
            '${assets_index_name}',
            '--uuid',
            '${auth_uuid}',
            { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
            { rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }], value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}'] }
          ],
          jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
        }
      })
    )
    await write(
      'versions/fabric-loader-0.18.4-1.21.8/fabric-loader-0.18.4-1.21.8.json',
      JSON.stringify({
        id: 'fabric-loader-0.18.4-1.21.8',
        inheritsFrom: '1.21.8',
        mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
        libraries: [{ name: 'org.ow2.asm:asm:9.8' }, { name: 'net.fabricmc:fabric-loader:0.18.4' }],
        arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] }
      })
    )
    await write('versions/fabric-loader-0.18.4-1.21.8/fabric-loader-0.18.4-1.21.8.jar', 'jeu')
    for (const lib of ['com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar', 'org/ow2/asm/asm/9.8/asm-9.8.jar', 'net/fabricmc/fabric-loader/0.18.4/fabric-loader-0.18.4.jar']) {
      await write(`libraries/${lib}`, 'lib')
    }
    const options = {
      installDir: install,
      versionId: 'fabric-loader-0.18.4-1.21.8',
      gameDir: join(root.dir, 'Testeur1'),
      nativesDir: join(root.dir, 'Testeur1', 'natives'),
      username: 'Testeur1',
      memoryMb: 4096,
      server: { host: '127.0.0.1', port: 25599 }
    }
    const args = await clientArguments(options)
    const classpath = args[args.indexOf('-cp') + 1].split(';').map((f) => f.slice(install.length + 1).replace(/\\/g, '/'))
    assert.deepEqual(
      classpath,
      [
        'libraries/org/ow2/asm/asm/9.8/asm-9.8.jar',
        'libraries/net/fabricmc/fabric-loader/0.18.4/fabric-loader-0.18.4.jar',
        'libraries/com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar',
        'versions/fabric-loader-0.18.4-1.21.8/fabric-loader-0.18.4-1.21.8.jar'
      ],
      'la bibliothèque du chargeur remplace celle du jeu ; rien pour macOS'
    )
    assert.deepEqual(args.slice(0, 2), ['-Xmx4096M', '-Xms512M'])
    assert.ok(args.includes('-DFabricMcEmu= net.minecraft.client.main.Main '))
    const main = args.indexOf('net.fabricmc.loader.impl.launch.knot.KnotClient')
    assert.deepEqual(args.slice(main + 1), [
      '--username',
      'Testeur1',
      '--gameDir',
      options.gameDir,
      '--assetIndex',
      '26',
      '--uuid',
      offlineUuid('Testeur1'),
      '--quickPlayMultiplayer',
      '127.0.0.1:25599'
    ])

    await rm(join(install, 'libraries/org/ow2/asm/asm/9.8/asm-9.8.jar'))
    await assert.rejects(clientArguments(options), /Bibliothèque du jeu absente \(org\.ow2\.asm:asm:9\.8\)\. Lance une fois ce profil depuis CurseForge/)
    await assert.rejects(clientArguments({ ...options, versionId: 'forge-47.4.18' }), /Le jeu \(forge-47\.4\.18\) n’est pas installé dans CurseForge/)
  })
})
